from django.db.models import Sum
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User, TalentGrant, Donation
from .permissions import IsTeacher, IsStudent, IsAdmin
from .serializers import (
    RegisterSerializer, LoginSerializer, UserSerializer,
    StudentBriefSerializer, TalentGrantSerializer, DonationSerializer,
    tree_stage,
)

# Community tree goal — how much donated talent fills the shared tree.
COMMUNITY_GOAL = 100


def community_stage(total):
    """Map community donated total to a 0-4 stage relative to the goal."""
    ratio = total / COMMUNITY_GOAL if COMMUNITY_GOAL else 0
    if ratio >= 1:
        return 4
    if ratio >= 0.75:
        return 3
    if ratio >= 0.5:
        return 2
    if ratio >= 0.25:
        return 1
    return 0


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

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def community(request):
    total = Donation.objects.aggregate(t=Sum('amount'))['t'] or 0
    donors = Donation.objects.values('student').distinct().count()
    recent = Donation.objects.select_related('student')[:15]
    return Response({
        'total_donated': total,
        'goal': COMMUNITY_GOAL,
        'stage': community_stage(total),
        'donor_count': donors,
        'recent_donations': DonationSerializer(recent, many=True).data,
    })


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
