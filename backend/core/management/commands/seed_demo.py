"""Populate demo data: 1 admin, 3 teachers, ~30 students, sample grants/donations."""

from django.core.management.base import BaseCommand

from core.models import User, TalentGrant, Donation


class Command(BaseCommand):
    help = '데모용 관리자/선생님/학생 계정과 샘플 데이터를 생성합니다.'

    def handle(self, *args, **options):
        # Admin (also a Django superuser so /admin works)
        admin, created = User.objects.get_or_create(
            username='관리자',
            defaults={'role': User.Role.ADMIN, 'is_staff': True, 'is_superuser': True},
        )
        admin.set_password('admin1234')
        admin.role = User.Role.ADMIN
        admin.is_staff = True
        admin.is_superuser = True
        admin.save()
        self.stdout.write(self.style.SUCCESS('관리자: 관리자 / admin1234'))

        teachers = []
        for name in ['김선생', '이선생', '박선생']:
            t, _ = User.objects.get_or_create(username=name, defaults={'role': User.Role.TEACHER})
            t.role = User.Role.TEACHER
            t.set_password('teacher1234')
            t.save()
            teachers.append(t)
        self.stdout.write(self.style.SUCCESS(f'선생님 {len(teachers)}명 (비번: teacher1234)'))

        students = []
        for i in range(1, 31):
            name = f'학생{i:02d}'
            s, _ = User.objects.get_or_create(username=name, defaults={'role': User.Role.STUDENT})
            s.role = User.Role.STUDENT
            s.teacher = teachers[(i - 1) % len(teachers)]
            s.set_password('student1234')
            s.save()
            students.append(s)
        self.stdout.write(self.style.SUCCESS(f'학생 {len(students)}명 (비번: student1234)'))

        # Sample grants + donations (idempotent-ish: only seed if empty)
        if not TalentGrant.objects.exists():
            reasons = ['예배에 집중했어요', '친구를 도와줬어요', '말씀을 암송했어요', '봉사에 참여했어요']
            for idx, s in enumerate(students):
                amount = (idx % 5) + 1
                TalentGrant.objects.create(
                    teacher=s.teacher, student=s,
                    amount=amount, reason=reasons[idx % len(reasons)],
                )
            self.stdout.write(self.style.SUCCESS('샘플 달란트 지급 생성'))

        if not Donation.objects.exists():
            for s in students[:10]:
                Donation.objects.create(student=s, amount=1, message='함께 키워요!')
            self.stdout.write(self.style.SUCCESS('샘플 기부 생성'))

        self.stdout.write(self.style.SUCCESS('\n[완료] 데모 데이터 준비 완료'))
