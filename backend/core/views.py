from django.db.models import Sum
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User, TalentGrant, Donation, DAILY_GRANT_LIMIT
from .permissions import IsTeacher, IsStudent, IsAdmin
from .serializers import (
    RegisterSerializer, LoginSerializer, UserSerializer,
    StudentBriefSerializer, TalentGrantSerializer, DonationSerializer,
    PublicDonationSerializer, tree_stage,
)

# Community tree growth — cumulative donated talent needed to reach each stage.
#   1단계 → 2단계: +2  (누적 2)
#   2단계 → 3단계: +3  (누적 5)
#   3단계 → 4단계: +3  (누적 8)
COMMUNITY_THRESHOLDS = [0, 2, 5, 8]
COMMUNITY_GOAL = COMMUNITY_THRESHOLDS[-1]  # fully-grown total (8)


def community_stage(total):
    """Map community donated total to a 0-3 stage (4 stages)."""
    stage = 0
    for i, threshold in enumerate(COMMUNITY_THRESHOLDS):
        if total >= threshold:
            stage = i
    return stage


def auth_payload(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {'token': token.key, 'user': UserSerializer(user).data}


# ---------------------------------------------------------------- auth

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return Response(auth_payload(user), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(auth_payload(serializer.validated_data['user']))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    Token.objects.filter(user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


# ---------------------------------------------------------------- community (any logged-in user)

def community_summary():
    """Anonymous aggregate of the shared tree — never exposes who donated."""
    total = Donation.objects.aggregate(t=Sum('amount'))['t'] or 0
    donors = Donation.objects.values('student').distinct().count()
    return {
        'total_donated': total,
        'goal': COMMUNITY_GOAL,
        'stage': community_stage(total),
        'donor_count': donors,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def community(request):
    # Recent feed is anonymous: amount + message only, no donor identity.
    recent = Donation.objects.all()[:15]
    return Response({
        **community_summary(),
        'recent_donations': PublicDonationSerializer(recent, many=True).data,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def community_display(request):
    """Public read-only view for the event-day big screen (no login needed)."""
    return Response(community_summary())


# ---------------------------------------------------------------- student

class StudentDashboard(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        user = request.user
        received = user.received_talent
        grants = user.grants_received.select_related('teacher')[:20]
        donations = user.donations.all()[:20]
        return Response({
            'user': UserSerializer(user).data,
            'received_talent': received,
            'donated_talent': user.donated_talent,
            'balance': user.balance,
            'stage': tree_stage(received),
            'goal': 40,
            'grants': TalentGrantSerializer(grants, many=True).data,
            'donations': DonationSerializer(donations, many=True).data,
        })


class DonateView(APIView):
    permission_classes = [IsStudent]

    def post(self, request):
        try:
            amount = int(request.data.get('amount', 1))
        except (TypeError, ValueError):
            return Response({'detail': '올바른 달란트 수를 입력해 주세요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if amount < 1:
            return Response({'detail': '1 달란트 이상 기부할 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if amount > request.user.balance:
            return Response({'detail': '보유한 달란트보다 많이 기부할 수 없어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        donation = Donation.objects.create(
            student=request.user,
            amount=amount,
            message=str(request.data.get('message', ''))[:200],
        )
        return Response(DonationSerializer(donation).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------- teacher

class TeacherStudents(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        students = request.user.students.all().order_by('username')
        return Response(StudentBriefSerializer(students, many=True).data)


class GrantView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request):
        student_id = request.data.get('student')
        student = User.objects.filter(
            id=student_id, role=User.Role.STUDENT, teacher=request.user
        ).first()
        if not student:
            return Response({'detail': '담당하는 학생만 달란트를 줄 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = int(request.data.get('amount', 1))
        except (TypeError, ValueError):
            return Response({'detail': '올바른 달란트 수를 입력해 주세요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if amount < 1:
            return Response({'detail': '1 달란트 이상 줄 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # 하루에 한 학생이 받을 수 있는 달란트는 최대 DAILY_GRANT_LIMIT 개.
        received_today = student.received_today
        if received_today + amount > DAILY_GRANT_LIMIT:
            remaining = max(0, DAILY_GRANT_LIMIT - received_today)
            return Response(
                {'detail': f'오늘은 이 학생에게 최대 {DAILY_GRANT_LIMIT}개까지 줄 수 있어요. '
                           f'(오늘 {received_today}개 지급 · {remaining}개 남음)'},
                status=status.HTTP_400_BAD_REQUEST)

        grant = TalentGrant.objects.create(
            teacher=request.user,
            student=student,
            amount=amount,
            reason=str(request.data.get('reason', ''))[:200],
        )
        return Response(TalentGrantSerializer(grant).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------- admin

class AdminUsers(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        teachers = User.objects.filter(role=User.Role.TEACHER).order_by('username')
        students = User.objects.filter(role=User.Role.STUDENT).order_by('username')
        return Response({
            'teachers': UserSerializer(teachers, many=True).data,
            'students': StudentBriefSerializer(students, many=True).data,
        })


class AssignStudent(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        student = User.objects.filter(
            id=request.data.get('student'), role=User.Role.STUDENT
        ).first()
        if not student:
            return Response({'detail': '학생을 찾을 수 없어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        teacher_id = request.data.get('teacher')
        if teacher_id in (None, '', 'null'):
            student.teacher = None
        else:
            teacher = User.objects.filter(id=teacher_id, role=User.Role.TEACHER).first()
            if not teacher:
                return Response({'detail': '선생님을 찾을 수 없어요.'},
                                status=status.HTTP_400_BAD_REQUEST)
            student.teacher = teacher
        student.save(update_fields=['teacher'])
        return Response(UserSerializer(student).data)


class SetRole(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        user = User.objects.filter(id=request.data.get('user')).first()
        role = request.data.get('role')
        if not user or role not in User.Role.values:
            return Response({'detail': '잘못된 요청이에요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        user.role = role
        if role != User.Role.STUDENT:
            user.teacher = None
        user.save()
        return Response(UserSerializer(user).data)


class AdminStats(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        total_received = TalentGrant.objects.aggregate(t=Sum('amount'))['t'] or 0
        total_donated = Donation.objects.aggregate(t=Sum('amount'))['t'] or 0
        return Response({
            'student_count': User.objects.filter(role=User.Role.STUDENT).count(),
            'teacher_count': User.objects.filter(role=User.Role.TEACHER).count(),
            'total_received': total_received,
            'total_donated': total_donated,
            'community_stage': community_stage(total_donated),
            'community_goal': COMMUNITY_GOAL,
        })
