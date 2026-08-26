"""달란트 시장 준비 — 상인 계정 생성과 암송 이벤트 담당 지정.

배포 후 Render Shell 에서 한 번만 실행한다:

    python manage.py setup_market
    python manage.py setup_market --host 제헌쌤 --password love

모드는 바꾸지 않는다. 시장을 여는 것은 행사 당일 관리자 화면의 토글이다
(미리 열어두면 아이들이 하루 전에 달란트를 다 써버린다).
여러 번 실행해도 안전하다 — 이미 있는 계정은 건드리지 않고 넘어간다.
"""

from django.core.management.base import BaseCommand

from core.models import User, SiteConfig

MERCHANTS = ['상인1', '상인2', '상인3', '상인4']


class Command(BaseCommand):
    help = '상인 계정을 만들고 암송 이벤트 담당 선생님을 지정한다.'

    def add_arguments(self, parser):
        parser.add_argument('--password', default='love', help='상인 계정 비밀번호')
        parser.add_argument('--host', default='제헌쌤', help='암송 이벤트 담당 선생님의 이름')
        parser.add_argument('--reset-passwords', action='store_true',
                            help='이미 있는 상인 계정의 비밀번호도 다시 설정한다')

    def handle(self, *args, **options):
        password = options['password']

        for name in MERCHANTS:
            user, created = User.objects.get_or_create(
                username=name, defaults={'role': User.Role.MERCHANT})
            if created or options['reset_passwords']:
                user.set_password(password)
            # 사람 손으로 역할이 바뀌었을 수 있으니 상인으로 맞춰 둔다.
            user.role = User.Role.MERCHANT
            user.teacher = None
            user.save()
            self.stdout.write(f'  {"만듦" if created else "이미 있음"} — {name}')

        config = SiteConfig.get()
        host = User.objects.filter(
            username=options['host'], role=User.Role.TEACHER).first()
        if host:
            config.event_host = host
            config.save()
            self.stdout.write(f'  암송 이벤트 담당 — {host.username}')
        else:
            self.stderr.write(
                f"  ⚠ '{options['host']}' 선생님을 찾지 못했습니다. "
                f'관리자 화면에서 직접 골라 주세요.')

        self.stdout.write(self.style.SUCCESS(
            f'\n준비 완료 · 현재 모드: {config.get_mode_display()}\n'
            f'행사 당일 관리자 화면에서 "달란트 시장 열기"를 누르세요.'))
