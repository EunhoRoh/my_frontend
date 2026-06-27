from django.core.management.base import BaseCommand

from core.models import TalentGrant, Donation


class Command(BaseCommand):
    help = (
        '달란트 데이터 초기화: 모든 달란트 지급(TalentGrant)과 기부(Donation) 기록을 '
        '삭제합니다. 계정(User)은 그대로 유지됩니다. 학생의 받은/기부/보유 달란트와 '
        '공동체 나무가 모두 0으로 돌아갑니다.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--yes',
            action='store_true',
            help='확인 프롬프트 없이 바로 삭제합니다 (Render Shell 등 비대화 환경용).',
        )

    def handle(self, *args, **options):
        grants = TalentGrant.objects.count()
        donations = Donation.objects.count()

        if grants == 0 and donations == 0:
            self.stdout.write('삭제할 달란트/기부 데이터가 없습니다.')
            return

        self.stdout.write(
            f'삭제 예정 — 달란트 지급 {grants}건 · 기부 {donations}건 (계정은 유지)'
        )

        if not options['yes']:
            confirm = input('정말 삭제할까요? "yes" 입력 시 진행: ')
            if confirm.strip().lower() != 'yes':
                self.stdout.write(self.style.WARNING('취소되었습니다.'))
                return

        Donation.objects.all().delete()
        TalentGrant.objects.all().delete()

        self.stdout.write(
            self.style.SUCCESS(
                f'초기화 완료 — 달란트 지급 {grants}건 · 기부 {donations}건 삭제됨. '
                '모든 학생의 달란트와 공동체 나무가 0으로 돌아갔습니다.'
            )
        )
