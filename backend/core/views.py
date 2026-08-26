from django.conf import settings
from django.db import transaction
from django.db.models import Sum, Count, OuterRef, Subquery, IntegerField
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User, TalentGrant, Donation, Purchase, SiteConfig
from .permissions import IsTeacher, IsStudent, IsAdmin, IsMerchant, IsEventHost
from .serializers import (
    RegisterSerializer, LoginSerializer, UserSerializer,
    StudentBriefSerializer, TalentGrantSerializer, DonationSerializer,
    PublicDonationSerializer, PurchaseSerializer, MerchantPurchaseSerializer,
    tree_stage,
)

# Community tree growth — 단계별 누적 기부 달란트 임계값은 settings 에서 온다
# (환경변수 COMMUNITY_THRESHOLDS 로 재배포 없이 조정 가능). 기본값 [0, 10, 24, 40].
def community_stage(total):
    """Map community donated total to a 0-3 stage (4 stages)."""
    stage = 0
    for i, threshold in enumerate(settings.COMMUNITY_THRESHOLDS):
        if total >= threshold:
            stage = i
    return stage


def community_goal():
    """나무가 완전히 자라는 누적 기부량(마지막 임계값)."""
    return settings.COMMUNITY_THRESHOLDS[-1]


def talent_subquery(model, **filters):
    """학생별 달란트 합계를 서브쿼리로 계산한다.

    모델의 received_talent/donated_talent(cached_property)는 한 요청 안의 중복 집계만
    막아줄 뿐, 인스턴스가 N개면 쿼리도 N배로 나간다. 이 애노테이션 값은 인스턴스
    __dict__ 에 들어가 cached_property 를 덮어쓰므로, 시리얼라이저는 코드 변경 없이
    이 값을 쓴다.

    filters 로 조건을 좁힐 수 있다(예: 취소된 결제 제외).
    """
    sq = (model.objects.filter(student=OuterRef('pk'), **filters)
          .values('student').annotate(s=Sum('amount')).values('s'))
    return Coalesce(Subquery(sq, output_field=IntegerField()), 0)


# 아직 살아있는 결제(대기 중 + 확인 완료)만 보유 달란트에서 뺀다. 취소된 건은 되돌려준 것.
LIVE_PURCHASE = {'status__in': [Purchase.Status.PENDING, Purchase.Status.DONE]}


def spent_subquery():
    return talent_subquery(Purchase, **LIVE_PURCHASE)


def with_talents(qs):
    """학생 쿼리셋에 받은/기부/사용 달란트를 한 번에 붙인다.

    셋을 다 붙여야 balance 가 추가 쿼리 없이 계산된다(하나라도 빠지면 인스턴스마다
    cached_property 가 되살아나 N+1 이 된다).
    """
    return qs.annotate(
        received_talent=talent_subquery(TalentGrant),
        donated_talent=talent_subquery(Donation),
        spent_talent=spent_subquery(),
    )


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
    # 합계와 기부자 수를 한 번의 집계로 구한다(같은 테이블을 두 번 훑지 않도록).
    agg = Donation.objects.aggregate(t=Sum('amount'), d=Count('student', distinct=True))
    total, donors = agg['t'] or 0, agg['d']
    return {
        'total_donated': total,
        'goal': community_goal(),
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
        # 시장 모드에서는 기부가 멈춰 이 값이 더 변하지 않는다. 프론트는 이걸 보고
        # 한 번만 받아두고 폴링을 끈다(아이 20명 × 분당 4회가 통째로 사라진다).
        'frozen': SiteConfig.get().is_market,
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
        # 가장 잦은 API(5초 폴링)라 사용자를 한 번에 완성해서 가져온다.
        # 애노테이션으로 받은/기부 집계 2쿼리를, select_related('teacher')로
        # teacher_name 지연 조회 1쿼리를 없앤다.
        user = with_talents(User.objects.select_related('teacher')).get(pk=request.user.pk)
        received = user.received_talent
        grants = user.grants_received.select_related('teacher')[:20]
        # select_related('student'): 기부 목록의 student_name 조회가 항목마다 쿼리를
        # 내지 않도록(N+1 방지) 조인해서 한 번에 가져온다.
        donations = user.donations.select_related('student')[:20]
        # 아직 상인이 확인하지 않은 결제. 아이 화면은 이걸 영수증으로 띄우고,
        # 도장(확인)을 기다린다. 방금 확인된 건도 잠깐 보여줘야 도장 애니메이션이
        # 뜨므로 최근 완료분까지 같이 내려준다.
        purchases = user.purchases.all()[:10]
        return Response({
            'mode': SiteConfig.get().mode,
            'user': UserSerializer(user).data,
            'received_talent': received,
            'donated_talent': user.donated_talent,
            'spent_talent': user.spent_talent,
            'balance': user.balance,
            'stage': tree_stage(received),
            'goal': 40,
            'grants': TalentGrantSerializer(grants, many=True).data,
            'donations': DonationSerializer(donations, many=True).data,
            'purchases': PurchaseSerializer(purchases, many=True).data,
        })


class DonateView(APIView):
    permission_classes = [IsStudent]

    def post(self, request):
        # 달란트 시장에서는 기부를 받지 않는다. 화면에서 버튼만 없애면 옛 화면을
        # 켜둔 기기가 그대로 요청을 보낼 수 있으므로 서버에서도 막는다.
        if SiteConfig.get().is_market:
            return Response({'detail': '오늘은 달란트 상점의 날이에요. 기부는 다음에 해요!'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = int(request.data.get('amount', 1))
        except (TypeError, ValueError):
            return Response({'detail': '올바른 달란트 수를 입력해 주세요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if amount < 1:
            return Response({'detail': '1 달란트 이상 기부할 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # 버튼이 두 번 눌리는 등으로 요청이 겹치면, 잠그지 않을 경우 두 요청이 모두
        # 같은 잔액을 읽고 각각 기부를 만들어 보유 달란트가 음수가 된다.
        # 학생 행을 잠근 뒤 잔액을 다시 세어 한 번에 하나씩만 처리되게 한다.
        with transaction.atomic():
            student = User.objects.select_for_update().get(pk=request.user.pk)
            if amount > student.balance:
                return Response({'detail': '보유한 달란트보다 많이 기부할 수 없어요.'},
                                status=status.HTTP_400_BAD_REQUEST)
            donation = Donation.objects.create(
                student=student,
                amount=amount,
                message=str(request.data.get('message', ''))[:200],
            )
        return Response(DonationSerializer(donation).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------- teacher

def today_start():
    """'오늘'의 시작(한국 시간 자정). 지급 목록과 취소 가능 기간이 같은 기준을 쓴다."""
    return timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)


def today_grants(teacher):
    """오늘(한국 시간 기준) 이 선생님이 준 지급 내역 요약.

    하루치는 많아야 수십~수백 건이라 한 번에 가져와 파이썬에서 합계를 낸다(집계 쿼리를
    따로 추가하지 않는다). select_related로 학생 이름 조회 N+1을 막는다.
    """
    grants = list(
        TalentGrant.objects.filter(teacher=teacher, created_at__gte=today_start())
        .select_related('student', 'teacher')
    )
    return {
        'total': sum(g.amount for g in grants),
        'count': len(grants),
        'grants': TalentGrantSerializer(grants[:50], many=True).data,
    }


class TeacherStudents(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        # select_related('teacher'): 카드마다 teacher_name 을 읽느라 학생 수만큼
        # 쿼리가 나가던 N+1 을 조인 한 번으로 없앤다.
        # annotate: 받은/기부 달란트를 학생마다 집계하지 않고 서브쿼리로 한 번에 계산한다.
        # 애노테이션 값은 인스턴스 __dict__ 에 들어가므로 모델의 cached_property 를
        # 그대로 덮어쓴다(= 시리얼라이저는 코드 변경 없이 이 값을 쓴다).
        students = with_talents(
            request.user.students.select_related('teacher')
        ).order_by('username')
        # 오늘의 지급 내역을 같은 응답에 담는다. 엔드포인트를 따로 두면 폴링마다 요청이
        # 2배가 되므로, 한 번의 왕복으로 끝내는 편이 체감 속도에 유리하다.
        config = SiteConfig.get()
        return Response({
            'mode': config.mode,
            # 시장 모드에서 이 선생님이 암송 이벤트 진행자인지. 맞으면 프론트가
            # '우리 반' 화면 대신 전체 학생 이벤트 화면으로 갈아탄다.
            'is_event_host': config.event_host_id == request.user.pk,
            'students': StudentBriefSerializer(students, many=True).data,
            'today': today_grants(request.user),
        })


class GrantView(APIView):
    """달란트 지급. 규칙을 여러 개 골라 한 번에 줄 수 있다.

    요청 형식 — ``{"student": 1, "items": [{"reason": "...", "amount": 2}, ...]}``
    규칙 하나당 TalentGrant 한 행으로 저장한다. 사유를 한 칸에 뭉쳐 넣지 않으므로
    학생 화면에서 규칙별로 보이고, 나중에 규칙별 통계도 낼 수 있다. 행이 여러 개여도
    bulk_create 로 INSERT 는 한 번만 나간다. 예전 단건 형식(amount/reason)도 받는다.
    """
    permission_classes = [IsTeacher]

    MAX_ITEMS = 20

    def post(self, request):
        student = User.objects.filter(
            id=request.data.get('student'), role=User.Role.STUDENT, teacher=request.user
        ).first()
        if not student:
            return Response({'detail': '담당하는 학생만 달란트를 줄 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        raw = request.data.get('items')
        if not isinstance(raw, list):  # 단건 요청 하위 호환
            raw = [{'amount': request.data.get('amount', 1),
                    'reason': request.data.get('reason', '')}]
        if not raw:
            return Response({'detail': '줄 규칙을 하나 이상 선택해 주세요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(raw) > self.MAX_ITEMS:
            return Response({'detail': f'한 번에 최대 {self.MAX_ITEMS}개까지 선택할 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        items = []
        for item in raw:
            if not isinstance(item, dict):
                return Response({'detail': '잘못된 요청이에요.'},
                                status=status.HTTP_400_BAD_REQUEST)
            try:
                amount = int(item.get('amount', 1))
            except (TypeError, ValueError):
                return Response({'detail': '올바른 달란트 수를 입력해 주세요.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if amount < 1:
                return Response({'detail': '1 달란트 이상 줄 수 있어요.'},
                                status=status.HTTP_400_BAD_REQUEST)
            items.append(TalentGrant(
                teacher=request.user,
                student=student,
                amount=amount,
                reason=str(item.get('reason', ''))[:200],
            ))

        grants = TalentGrant.objects.bulk_create(items)
        return Response({
            'granted': sum(g.amount for g in grants),
            'grants': TalentGrantSerializer(grants, many=True).data,
        }, status=status.HTTP_201_CREATED)


class GrantDetail(APIView):
    """잘못 준 달란트 되돌리기 — 내가 오늘 준 지급만 삭제할 수 있다.

    당일 제한과 본인 지급 제한은 여기서 다시 확인한다. 화면에는 오늘 것만 보이지만,
    자정을 넘긴 채 켜둔 화면이나 남의 지급 id 로도 요청이 올 수 있기 때문이다.
    """
    permission_classes = [IsTeacher]

    def delete(self, request, pk):
        # 잔액 확인과 삭제 사이에 아이가 상점에서 결제하면 보유 달란트가 음수가 된다.
        # 학생 행을 잠근 뒤 잔액을 다시 세고, 같은 트랜잭션 안에서 지운다.
        with transaction.atomic():
            grant = (TalentGrant.objects
                     .filter(pk=pk, teacher=request.user, created_at__gte=today_start())
                     .first())
            if grant is None:
                return Response({'detail': '오늘 준 달란트만 취소할 수 있어요.'},
                                status=status.HTTP_400_BAD_REQUEST)

            # 학생이 이미 써버렸다면 취소하지 않는다. 지급만 지우면 보유 달란트가 음수가
            # 되고, 공동체 나무에 반영된 기부나 이미 건넨 물건은 되돌릴 수 없다.
            student = User.objects.select_for_update().get(pk=grant.student_id)
            if student.balance < grant.amount:
                return Response(
                    {'detail': f'{student.username} 학생이 이미 사용해서 취소할 수 없어요. '
                               f'관리자에게 문의해 주세요.'},
                    status=status.HTTP_400_BAD_REQUEST)

            grant.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- admin

class AdminUsers(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        teachers = list(
            User.objects.filter(role=User.Role.TEACHER)
            .order_by('username').values('id', 'username')
        )
        # 받은/기부/사용 달란트를 학생별 개별 쿼리(N+1) 대신 서브쿼리로 한 번에 계산.
        rows = (with_talents(User.objects.filter(role=User.Role.STUDENT))
                .order_by('username')
                .values('id', 'username', 'received_talent', 'donated_talent',
                        'spent_talent', 'teacher'))
        students = [{
            'id': r['id'], 'username': r['username'],
            'received_talent': r['received_talent'], 'donated_talent': r['donated_talent'],
            'spent_talent': r['spent_talent'],
            'balance': r['received_talent'] - r['donated_talent'] - r['spent_talent'],
            'teacher': r['teacher'],
        } for r in rows]
        return Response({'teachers': teachers, 'students': students})


class AdminDonations(APIView):
    """관리자 전용: 기부 내역을 실명으로 조회(누가·얼마·언제).

    공동체 피드(`/community/`)는 익명(별칭)으로만 노출되지만, 관리자는 운영·결산을
    위해 실제 기부자 이름을 볼 수 있어야 한다. select_related로 이름 조회 N+1을 막고,
    최근 200건까지 반환한다.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        donations = (Donation.objects.select_related('student')
                     .order_by('-created_at')[:200])
        return Response(DonationSerializer(donations, many=True).data)


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


class DeleteUser(APIView):
    """선생님/학생 계정 삭제 (관리자 전용).

    관리자·슈퍼유저 계정은 보호를 위해 삭제할 수 없다. 선생님을 삭제하면 그가 준
    달란트 지급 기록은 함께 삭제되고(CASCADE), 담당 학생은 '담당 없음'이 된다(SET_NULL).
    학생을 삭제하면 그 학생의 받은 지급·기부 기록도 함께 삭제된다(CASCADE).
    """
    permission_classes = [IsAdmin]

    def post(self, request):
        user = User.objects.filter(id=request.data.get('user')).first()
        if not user:
            return Response({'detail': '사용자를 찾을 수 없어요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if user.role == User.Role.ADMIN or user.is_superuser:
            return Response({'detail': '관리자 계정은 삭제할 수 없어요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        username = user.username
        user.delete()
        return Response({'deleted': username})


class ResetTalents(APIView):
    """달란트 지급·기부 데이터를 모두 삭제(계정은 유지). 관리자 전용."""
    permission_classes = [IsAdmin]

    def post(self, request):
        grants = TalentGrant.objects.count()
        donations = Donation.objects.count()
        # 결제까지 지워야 한다. 지급만 지우고 결제를 남기면 보유 달란트가 음수가 된다.
        purchases = Purchase.objects.count()
        Purchase.objects.all().delete()
        Donation.objects.all().delete()
        TalentGrant.objects.all().delete()
        return Response({'deleted_grants': grants, 'deleted_donations': donations,
                         'deleted_purchases': purchases})


class AdminStats(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        total_received = TalentGrant.objects.aggregate(t=Sum('amount'))['t'] or 0
        total_donated = Donation.objects.aggregate(t=Sum('amount'))['t'] or 0
        spent = Purchase.objects.filter(**LIVE_PURCHASE).aggregate(t=Sum('amount'))
        config = SiteConfig.get()
        return Response({
            'student_count': User.objects.filter(role=User.Role.STUDENT).count(),
            'teacher_count': User.objects.filter(role=User.Role.TEACHER).count(),
            'total_received': total_received,
            'total_donated': total_donated,
            'total_spent': spent['t'] or 0,
            'pending_purchases': Purchase.objects.filter(
                status=Purchase.Status.PENDING).count(),
            'community_stage': community_stage(total_donated),
            'community_goal': community_goal(),
            # 운영 설정도 이 응답에 함께 싣는다(관리자 화면이 이미 폴링하는 엔드포인트라
            # 토글 하나 때문에 요청을 늘리지 않는다).
            'mode': config.mode,
            'event_host': config.event_host_id,
            'event_host_name': config.event_host.username if config.event_host else None,
        })


class AdminConfig(APIView):
    """운영 모드 전환 — 기본 ⇄ 달란트 시장, 그리고 암송 이벤트 담당 지정."""

    permission_classes = [IsAdmin]

    def post(self, request):
        config = SiteConfig.get()
        changed = []

        if 'mode' in request.data:
            mode = request.data.get('mode')
            if mode not in SiteConfig.Mode.values:
                return Response({'detail': '알 수 없는 모드예요.'},
                                status=status.HTTP_400_BAD_REQUEST)
            config.mode = mode
            changed.append('mode')

        if 'event_host' in request.data:
            host_id = request.data.get('event_host')
            if host_id in (None, '', 'null'):
                config.event_host = None
            else:
                host = User.objects.filter(id=host_id, role=User.Role.TEACHER).first()
                if not host:
                    return Response({'detail': '선생님만 이벤트 담당이 될 수 있어요.'},
                                    status=status.HTTP_400_BAD_REQUEST)
                config.event_host = host
            changed.append('event_host')

        if not changed:
            return Response({'detail': '바꿀 값이 없어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        config.save()
        return Response({
            'mode': config.mode,
            'event_host': config.event_host_id,
            'event_host_name': config.event_host.username if config.event_host else None,
        })


# ---------------------------------------------------------------- 달란트 상점 (시장 모드)

# 오조작 방지 상한. 잔액 검사만으로는 40달란트 가진 아이가 실수로 40을 다 내는 걸
# 막지 못한다. 상품 값이 이보다 클 일은 없다.
MAX_PURCHASE = 100


def market_required():
    """시장 모드가 아니면 거절 사유를 돌려준다(맞으면 None)."""
    if SiteConfig.get().is_market:
        return None
    return Response({'detail': '지금은 달란트 상점을 열지 않았어요.'},
                    status=status.HTTP_400_BAD_REQUEST)


class PurchaseView(APIView):
    """아이가 달란트 상점에 달란트를 낸다.

    달란트는 낸 즉시 차감한다. 상인이 확인할 때 차감하면 그 사이에 같은 달란트로
    여러 번 낼 수 있다. 잔액 검사와 차감 사이에 다른 요청이 끼어들지 않도록
    학생 행을 잠근 채(select_for_update) 처리한다.
    """

    permission_classes = [IsStudent]

    def post(self, request):
        blocked = market_required()
        if blocked:
            return blocked

        try:
            amount = int(request.data.get('amount', 0))
        except (TypeError, ValueError):
            return Response({'detail': '올바른 달란트 수를 입력해 주세요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if amount < 1:
            return Response({'detail': '1 달란트 이상 내야 해요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if amount > MAX_PURCHASE:
            return Response({'detail': f'한 번에 {MAX_PURCHASE} 달란트까지만 낼 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            student = User.objects.select_for_update().get(pk=request.user.pk)
            # 확인 번호가 동시에 두 개면 계산대에서 어느 것을 처리할지 헷갈린다.
            # 한 건을 끝내고 다음 것을 내도록 한다(실제 가게의 줄과 같다).
            if Purchase.objects.filter(
                    student=student, status=Purchase.Status.PENDING).exists():
                return Response(
                    {'detail': '아직 확인 안 된 결제가 있어요. 상인 선생님께 먼저 보여주세요.'},
                    status=status.HTTP_400_BAD_REQUEST)
            balance = student.balance
            if amount > balance:
                return Response(
                    {'detail': f'가진 달란트는 {balance}개예요. 그보다 많이 낼 수 없어요.'},
                    status=status.HTTP_400_BAD_REQUEST)
            purchase = Purchase.objects.create(student=student, amount=amount)

        return Response({
            'purchase': PurchaseSerializer(purchase).data,
            'balance': balance - amount,
        }, status=status.HTTP_201_CREATED)


class PurchaseCancel(APIView):
    """아이가 자기 결제를 스스로 무르기 — 상인이 확인하기 전(대기 중)에만 가능.

    확인이 끝난 뒤에도 무를 수 있으면 물건을 받고 달란트를 되찾을 수 있다.
    그 시점부터는 상인만 취소할 수 있다.
    """

    permission_classes = [IsStudent]

    def post(self, request, pk):
        # 아이가 무르기를 누르는 순간과 상인이 확인을 누르는 순간은 실제로 겹친다
        # (계산대 앞에서 망설이다 누르기 때문에). 잠그지 않고 상태만 보고 덮어쓰면
        # 상인이 방금 확정한 '확인 완료'를 지워, 물건은 나가고 달란트는 돌아간다.
        # 결제 행을 잠근 뒤 상태를 다시 읽어 한쪽만 이기게 한다.
        with transaction.atomic():
            purchase = (Purchase.objects.select_for_update(of=('self',))
                        .filter(pk=pk, student=request.user).first())
            if purchase is None:
                return Response({'detail': '결제를 찾을 수 없어요.'},
                                status=status.HTTP_400_BAD_REQUEST)
            # 상인이 먼저 돌려준 건인데 '확인돼서 못 무른다'고 하면 아이가 혼란스럽다.
            # 이미 환불된 상태라면 사실대로 알려준다(달란트는 이미 돌아와 있다).
            if purchase.status == Purchase.Status.REFUNDED:
                return Response({'detail': '이미 취소된 결제예요. 달란트는 돌려받았어요!'},
                                status=status.HTTP_400_BAD_REQUEST)
            if purchase.status != Purchase.Status.PENDING:
                return Response({'detail': '상인 선생님이 이미 확인해서 무를 수 없어요.'},
                                status=status.HTTP_400_BAD_REQUEST)

            purchase.status = Purchase.Status.REFUNDED
            purchase.settled_at = timezone.now()
            purchase.save(update_fields=['status', 'settled_at'])
        return Response({
            'purchase': PurchaseSerializer(purchase).data,
            'balance': User.objects.get(pk=request.user.pk).balance,
        })


class MerchantPurchases(APIView):
    """상인 화면 — 확인 대기 목록과 오늘 처리 내역.

    상인 계정이 넷이어도 같은 테이블을 보므로 화면은 저절로 동기화된다.
    """

    permission_classes = [IsMerchant]

    def get(self, request):
        # 먼저 낸 아이부터 처리하도록 오름차순(줄 선 순서).
        pending = (Purchase.objects.filter(status=Purchase.Status.PENDING)
                   .select_related('student').order_by('created_at'))
        settled = (Purchase.objects.filter(settled_at__gte=today_start())
                   .exclude(status=Purchase.Status.PENDING)
                   .select_related('student', 'merchant')[:30])
        done_today = Purchase.objects.filter(
            status=Purchase.Status.DONE, settled_at__gte=today_start())
        return Response({
            'pending': MerchantPurchaseSerializer(pending, many=True).data,
            'settled': MerchantPurchaseSerializer(settled, many=True).data,
            'today_total': done_today.aggregate(t=Sum('amount'))['t'] or 0,
            'today_count': done_today.count(),
        })

    def post(self, request, pk):
        action = request.data.get('action')
        if action not in ('confirm', 'refund'):
            return Response({'detail': '알 수 없는 요청이에요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # 상인 둘이 같은 건을 동시에 누르면 나중 사람이 앞사람 처리를 덮어쓴다.
        # 행을 잠그고 현재 상태를 다시 확인해 한 번만 처리되게 한다.
        with transaction.atomic():
            # of=('self',): 결제 행만 잠근다. 기본값은 조인된 학생 행까지 잠가서,
            # 학생 행을 먼저 잠그는 결제 요청과 잠금 순서가 엇갈릴 수 있다.
            purchase = (Purchase.objects.select_for_update(of=('self',))
                        .filter(pk=pk).select_related('student').first())
            if purchase is None:
                return Response({'detail': '결제를 찾을 수 없어요.'},
                                status=status.HTTP_400_BAD_REQUEST)

            if action == 'confirm':
                if purchase.status != Purchase.Status.PENDING:
                    return Response(
                        {'detail': f'이미 처리된 결제예요 ({purchase.get_status_display()}).'},
                        status=status.HTTP_400_BAD_REQUEST)
                purchase.status = Purchase.Status.DONE
            else:
                if purchase.status == Purchase.Status.REFUNDED:
                    return Response({'detail': '이미 취소된 결제예요.'},
                                    status=status.HTTP_400_BAD_REQUEST)
                purchase.status = Purchase.Status.REFUNDED

            purchase.merchant = request.user
            purchase.settled_at = timezone.now()
            purchase.save(update_fields=['status', 'merchant', 'settled_at'])

        return Response(MerchantPurchaseSerializer(purchase).data)


# ---------------------------------------------------------------- 말씀 암송 이벤트

# 기존 주일 지급 규칙에도 '말씀 암송을 해요'가 있어, 사유가 겹치면 과거 지급까지
# 세어버린다. 이벤트 전용 사유를 따로 두고 당일 것만 센다.
VERSE_REASON = '달란트 시장 · 말씀 암송'
VERSE_MAX = 3


def verse_counts():
    """오늘 학생별 암송 보너스 횟수 {student_id: count}."""
    rows = (TalentGrant.objects
            .filter(reason=VERSE_REASON, created_at__gte=today_start())
            .values('student').annotate(n=Count('id')))
    return {r['student']: r['n'] for r in rows}


class EventStudents(APIView):
    """암송 이벤트 화면 — 담당 반과 무관하게 전체 학생을 보여준다.

    '1달란트만 더 있으면 살 수 있어요' 하고 오는 아이들이라, 남은 기회와 함께
    지금 잔액을 같이 내려줘야 진행자가 바로 판단할 수 있다.
    """

    permission_classes = [IsEventHost]

    def get(self, request):
        counts = verse_counts()
        students = with_talents(
            User.objects.filter(role=User.Role.STUDENT)
        ).order_by('username')
        rows = [{
            'id': s.id,
            'username': s.username,
            'balance': s.balance,
            'verse_count': counts.get(s.id, 0),
            'remaining': VERSE_MAX - counts.get(s.id, 0),
        } for s in students]
        return Response({
            'max_per_student': VERSE_MAX,
            'students': rows,
            'today_given': sum(counts.values()),
        })


class EventGrant(APIView):
    """암송 보너스 1달란트 지급 / 되돌리기."""

    permission_classes = [IsEventHost]

    def post(self, request):
        blocked = market_required()
        if blocked:
            return blocked

        student = User.objects.filter(
            id=request.data.get('student'), role=User.Role.STUDENT).first()
        if not student:
            return Response({'detail': '학생을 찾을 수 없어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        if request.data.get('undo'):
            # 잘못 눌러 되돌리는 일은 이벤트 중에 잦고, 그 사이 아이가 상점에서
            # 결제하면 보유 달란트가 음수가 된다. 학생 행을 잠근 채 확인하고 지운다.
            with transaction.atomic():
                locked = User.objects.select_for_update().get(pk=student.pk)
                latest = (TalentGrant.objects
                          .filter(student=locked, reason=VERSE_REASON,
                                  created_at__gte=today_start())
                          .order_by('-created_at').first())
                if latest is None:
                    return Response({'detail': '오늘 준 암송 달란트가 없어요.'},
                                    status=status.HTTP_400_BAD_REQUEST)
                if locked.balance < latest.amount:
                    return Response(
                        {'detail': f'{locked.username} 학생이 이미 사용해서 되돌릴 수 없어요.'},
                        status=status.HTTP_400_BAD_REQUEST)
                latest.delete()
        else:
            # 세는 것과 만드는 것 사이에 다른 요청이 끼면 한도를 넘을 수 있다.
            with transaction.atomic():
                locked = User.objects.select_for_update().get(pk=student.pk)
                count = TalentGrant.objects.filter(
                    student=locked, reason=VERSE_REASON,
                    created_at__gte=today_start()).count()
                if count >= VERSE_MAX:
                    return Response(
                        {'detail': f'{student.username} 학생은 이미 {VERSE_MAX}개를 다 받았어요.'},
                        status=status.HTTP_400_BAD_REQUEST)
                TalentGrant.objects.create(
                    teacher=request.user, student=locked, amount=1, reason=VERSE_REASON)

        fresh = User.objects.get(pk=student.pk)
        count = TalentGrant.objects.filter(
            student=fresh, reason=VERSE_REASON, created_at__gte=today_start()).count()
        return Response({
            'id': fresh.id,
            'username': fresh.username,
            'balance': fresh.balance,
            'verse_count': count,
            'remaining': VERSE_MAX - count,
        })
