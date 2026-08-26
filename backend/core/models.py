import secrets

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.functional import cached_property


class User(AbstractUser):
    """Custom user with a role. Login identifier is ``username`` (이름)."""

    class Role(models.TextChoices):
        STUDENT = 'student', '학생'
        TEACHER = 'teacher', '선생님'
        MERCHANT = 'merchant', '상인'  # 달란트 상점에서 결제를 확인해 주는 사람
        ADMIN = 'admin', '관리자'

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.STUDENT,
        verbose_name='역할',
    )
    # For students: the teacher they are assigned to.
    teacher = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='students',
        limit_choices_to={'role': Role.TEACHER},
        verbose_name='담당 선생님',
    )

    @property
    def is_student(self):
        return self.role == self.Role.STUDENT

    @property
    def is_teacher(self):
        return self.role == self.Role.TEACHER

    # received_talent / donated_talent 는 한 요청 안에서 여러 번(뷰·시리얼라이저의
    # balance·stage 등) 참조된다. @property 로 두면 매 참조마다 집계 쿼리가 새로 나가
    # 대시보드 한 번에 같은 값을 9번쯤 계산했다. @cached_property 로 인스턴스 수명(=요청
    # 하나) 동안 결과를 재사용해 요청당 집계 쿼리를 2번으로 줄인다.
    # 캐시는 요청이 끝나면 사라지므로(매 요청 사용자를 새로 로드) 최신 반영은 그대로다.
    @cached_property
    def received_talent(self):
        """Total talent a student has received from teachers."""
        return self.grants_received.aggregate(total=models.Sum('amount'))['total'] or 0

    @cached_property
    def donated_talent(self):
        """Total talent a student has donated to the community tree."""
        return self.donations.aggregate(total=models.Sum('amount'))['total'] or 0

    @cached_property
    def spent_talent(self):
        """달란트 상점에서 쓴 달란트. 취소(환불)된 건은 빼고 센다."""
        return self.purchases.exclude(
            status=Purchase.Status.REFUNDED
        ).aggregate(total=models.Sum('amount'))['total'] or 0

    @property
    def balance(self):
        """Talent currently held (received minus donated minus spent)."""
        return self.received_talent - self.donated_talent - self.spent_talent

    def __str__(self):
        return f'{self.username} ({self.get_role_display()})'


class TalentGrant(models.Model):
    """A teacher awarding talent to a student, with a reason (칭찬 사유)."""

    teacher = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='grants_given',
        limit_choices_to={'role': User.Role.TEACHER},
        verbose_name='지급 선생님',
    )
    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='grants_received',
        limit_choices_to={'role': User.Role.STUDENT},
        verbose_name='받은 학생',
    )
    amount = models.PositiveIntegerField('달란트', default=1)
    reason = models.CharField('사유', max_length=200, blank=True)
    created_at = models.DateTimeField('지급 시각', auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = '달란트 지급'
        verbose_name_plural = '달란트 지급 내역'

    def __str__(self):
        return f'{self.teacher} → {self.student}: {self.amount} 달란트'


class Donation(models.Model):
    """A student donating their held talent to the shared community tree."""

    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='donations',
        limit_choices_to={'role': User.Role.STUDENT},
        verbose_name='기부 학생',
    )
    amount = models.PositiveIntegerField('기부 달란트', default=1)
    message = models.CharField('기부 메시지', max_length=200, blank=True)
    created_at = models.DateTimeField('기부 시각', auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = '기부'
        verbose_name_plural = '기부 내역'

    def __str__(self):
        return f'{self.student}: {self.amount} 달란트 기부'


class SiteConfig(models.Model):
    """앱 전체의 동작 모드를 담는 단 하나의 설정 행(pk=1 고정).

    달란트 시장 당일에는 화면과 규칙이 통째로 바뀐다(기부 중단, 상점 결제 개시).
    모드를 별도 엔드포인트로 두면 모든 기기가 그것까지 폴링해야 하므로, 값은
    이미 도는 대시보드·공동체 응답에 실어 보낸다 — 추가 요청 0건으로 전 기기가
    다음 폴링(최대 5초) 안에 자동 전환된다.
    """

    class Mode(models.TextChoices):
        CLASSIC = 'classic', '기본'
        MARKET = 'market', '달란트 시장'

    mode = models.CharField(
        max_length=10, choices=Mode.choices, default=Mode.CLASSIC, verbose_name='운영 모드',
    )
    # 암송 이벤트 진행자. 시장 모드에서 이 선생님만 '반 상관없이 전체 학생'에게
    # 보너스 달란트를 줄 수 있다. 이름을 코드에 박으면 담당이 바뀔 때 재배포해야 해서
    # 관리자 화면에서 고르게 둔다.
    event_host = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
        limit_choices_to={'role': User.Role.TEACHER}, verbose_name='암송 이벤트 담당',
    )

    class Meta:
        verbose_name = '운영 설정'
        verbose_name_plural = '운영 설정'

    def save(self, *args, **kwargs):
        self.pk = 1  # 행이 여러 개 생기지 않도록 못 박는다
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        config, _ = cls.objects.get_or_create(pk=1)
        return config

    @property
    def is_market(self):
        return self.mode == self.Mode.MARKET

    def __str__(self):
        return self.get_mode_display()


def new_purchase_code():
    """상인에게 보여줄 4자리 확인 번호.

    대기 중인 번호끼리 겹치면 상인이 어느 아이 것인지 헷갈리므로, 아직 확인되지
    않은 번호는 피해서 뽑는다. 예측이 쉬우면 남의 번호를 가로챌 수 있어 secrets 를 쓴다.
    """
    taken = set(
        Purchase.objects.filter(status=Purchase.Status.PENDING).values_list('code', flat=True)
    )
    for _ in range(50):
        code = f'{secrets.randbelow(10000):04d}'
        if code not in taken:
            return code
    return f'{secrets.randbelow(10000):04d}'  # 사실상 도달 불가(동시 대기 50건 이상)


class Purchase(models.Model):
    """아이가 '달란트 상점'에 낸 달란트 한 건.

    상품 목록은 두지 않는다 — 아이가 낼 금액을 직접 입력하고, 상인이 실물을 건넨 뒤
    화면에서 확인을 누르는 방식이다. 달란트는 낸 즉시 차감된다(확인 시점이 아니라).
    그래야 아이가 같은 달란트로 여러 번 낼 수 없다.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', '확인 대기'
        DONE = 'done', '확인 완료'
        REFUNDED = 'refunded', '취소됨'

    student = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='purchases',
        limit_choices_to={'role': User.Role.STUDENT}, verbose_name='낸 학생',
    )
    amount = models.PositiveIntegerField('낸 달란트')
    code = models.CharField('확인 번호', max_length=4, default=new_purchase_code)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING,
        db_index=True, verbose_name='상태',
    )
    # 확인·취소를 처리한 상인. 환불 책임 소재를 남기기 위해 기록한다.
    merchant = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='settled_purchases', verbose_name='처리한 상인',
    )
    created_at = models.DateTimeField('낸 시각', auto_now_add=True)
    settled_at = models.DateTimeField('확인·취소 시각', null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = '달란트 결제'
        verbose_name_plural = '달란트 결제 내역'

    def __str__(self):
        return f'{self.student}: {self.amount} 달란트 ({self.get_status_display()})'
