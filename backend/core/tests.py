from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import User, TalentGrant, Donation, Purchase, SiteConfig


class CancelGrantTests(APITestCase):
    """오늘 준 달란트 취소 — DELETE /api/teacher/grant/<pk>/"""

    def setUp(self):
        self.teacher = User.objects.create_user(
            username='선생님', password='pw', role=User.Role.TEACHER)
        self.other_teacher = User.objects.create_user(
            username='다른선생님', password='pw', role=User.Role.TEACHER)
        self.student = User.objects.create_user(
            username='학생', password='pw', role=User.Role.STUDENT, teacher=self.teacher)

    def grant(self, teacher=None, amount=3):
        return TalentGrant.objects.create(
            teacher=teacher or self.teacher, student=self.student,
            amount=amount, reason='칭찬 · 인사 잘하기')

    def backdate(self, grant, days=1):
        """auto_now_add 라 생성 후에 시각을 직접 밀어 넣는다."""
        TalentGrant.objects.filter(pk=grant.pk).update(
            created_at=timezone.now() - timedelta(days=days))

    def delete(self, grant, as_user=None):
        self.client.force_authenticate(as_user or self.teacher)
        return self.client.delete(f'/api/teacher/grant/{grant.pk}/')

    def test_deletes_todays_own_grant(self):
        grant = self.grant()
        response = self.delete(grant)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TalentGrant.objects.filter(pk=grant.pk).exists())
        self.assertEqual(User.objects.get(pk=self.student.pk).received_talent, 0)

    def test_rejects_grant_from_a_previous_day(self):
        grant = self.grant()
        self.backdate(grant)
        response = self.delete(grant)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(TalentGrant.objects.filter(pk=grant.pk).exists())

    def test_rejects_another_teachers_grant(self):
        grant = self.grant(teacher=self.other_teacher)
        response = self.delete(grant)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(TalentGrant.objects.filter(pk=grant.pk).exists())

    def test_rejects_when_student_already_donated_the_talent(self):
        """취소하면 보유가 음수가 되는 경우 — 기부는 이미 나무에 반영돼 되돌릴 수 없다."""
        grant = self.grant(amount=3)
        Donation.objects.create(student=self.student, amount=3)
        response = self.delete(grant)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(TalentGrant.objects.filter(pk=grant.pk).exists())

    def test_allows_cancel_when_enough_talent_remains(self):
        """다른 지급분이 남아 있어 취소해도 보유가 음수가 되지 않으면 허용한다."""
        self.grant(amount=5)
        grant = self.grant(amount=3)
        Donation.objects.create(student=self.student, amount=4)
        response = self.delete(grant)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(User.objects.get(pk=self.student.pk).balance, 1)

    def test_students_cannot_cancel(self):
        grant = self.grant()
        response = self.delete(grant, as_user=self.student)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(TalentGrant.objects.filter(pk=grant.pk).exists())

    def test_missing_grant_is_rejected(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.delete('/api/teacher/grant/99999/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class MarketTestCase(APITestCase):
    """달란트 시장 공통 준비 — 학생 1명, 상인 1명, 이벤트 진행자 1명."""

    def setUp(self):
        self.teacher = User.objects.create_user(
            username='선생님', password='pw', role=User.Role.TEACHER)
        self.host = User.objects.create_user(
            username='제헌쌤', password='pw', role=User.Role.TEACHER)
        self.merchant = User.objects.create_user(
            username='상인1', password='pw', role=User.Role.MERCHANT)
        self.student = User.objects.create_user(
            username='학생', password='pw', role=User.Role.STUDENT, teacher=self.teacher)
        self.other = User.objects.create_user(
            username='다른학생', password='pw', role=User.Role.STUDENT, teacher=self.teacher)
        TalentGrant.objects.create(
            teacher=self.teacher, student=self.student, amount=20, reason='칭찬')
        self.config = SiteConfig.get()
        self.config.mode = SiteConfig.Mode.MARKET
        self.config.event_host = self.host
        self.config.save()

    def balance(self, user=None):
        return User.objects.get(pk=(user or self.student).pk).balance

    def pay(self, amount, as_user=None):
        self.client.force_authenticate(as_user or self.student)
        return self.client.post('/api/student/purchase/', {'amount': amount}, format='json')


class PurchaseTests(MarketTestCase):
    """아이가 달란트 상점에 달란트를 내는 흐름."""

    def test_pay_deducts_balance_and_returns_code(self):
        response = self.pay(5)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['balance'], 15)
        self.assertEqual(self.balance(), 15)
        code = response.data['purchase']['code']
        self.assertEqual(len(code), 4)
        self.assertTrue(code.isdigit())

    def test_rejects_more_than_balance(self):
        response = self.pay(21)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.balance(), 20)

    def test_rejects_over_the_hard_cap(self):
        TalentGrant.objects.create(
            teacher=self.teacher, student=self.student, amount=200, reason='많이')
        response = self.pay(101)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_zero_and_negative(self):
        for amount in (0, -3):
            self.assertEqual(self.pay(amount).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.balance(), 20)

    def test_blocked_outside_market_mode(self):
        self.config.mode = SiteConfig.Mode.CLASSIC
        self.config.save()
        response = self.pay(5)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.balance(), 20)

    def test_only_one_payment_may_wait_at_a_time(self):
        """확인 번호가 둘이면 계산대에서 헷갈린다 — 한 건씩만 대기시킨다."""
        self.assertEqual(self.pay(5).status_code, status.HTTP_201_CREATED)
        second = self.pay(3)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.balance(), 15)

    def test_can_pay_again_after_the_previous_one_is_confirmed(self):
        pid = self.pay(5).data['purchase']['id']
        self.client.force_authenticate(self.merchant)
        self.client.post(f'/api/merchant/purchases/{pid}/', {'action': 'confirm'}, format='json')
        self.assertEqual(self.pay(3).status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.balance(), 12)

    def test_charge_happens_immediately_not_at_confirmation(self):
        """확인 시점에 차감하면 그 사이 같은 달란트로 여러 번 낼 수 있다."""
        self.pay(20)
        self.assertEqual(self.balance(), 0)


class PurchaseCancelTests(MarketTestCase):
    """확인 전에는 아이가 스스로 무를 수 있고, 확인 뒤에는 못 무른다."""

    def cancel(self, purchase_id, as_user=None):
        self.client.force_authenticate(as_user or self.student)
        return self.client.post(f'/api/student/purchase/{purchase_id}/cancel/')

    def test_student_cancels_pending_and_gets_talent_back(self):
        pid = self.pay(5).data['purchase']['id']
        response = self.cancel(pid)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.balance(), 20)
        self.assertEqual(Purchase.objects.get(pk=pid).status, Purchase.Status.REFUNDED)

    def test_cannot_cancel_after_merchant_confirmed(self):
        pid = self.pay(5).data['purchase']['id']
        self.client.force_authenticate(self.merchant)
        self.client.post(f'/api/merchant/purchases/{pid}/', {'action': 'confirm'}, format='json')
        response = self.cancel(pid)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.balance(), 15)

    def test_cannot_cancel_someone_elses_purchase(self):
        pid = self.pay(5).data['purchase']['id']
        response = self.cancel(pid, as_user=self.other)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.balance(), 15)


class MerchantTests(MarketTestCase):
    """상인의 확인·취소."""

    def act(self, purchase_id, action, as_user=None):
        self.client.force_authenticate(as_user or self.merchant)
        return self.client.post(
            f'/api/merchant/purchases/{purchase_id}/', {'action': action}, format='json')

    def test_confirm_marks_done_and_records_merchant(self):
        pid = self.pay(5).data['purchase']['id']
        response = self.act(pid, 'confirm')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        purchase = Purchase.objects.get(pk=pid)
        self.assertEqual(purchase.status, Purchase.Status.DONE)
        self.assertEqual(purchase.merchant, self.merchant)
        self.assertIsNotNone(purchase.settled_at)
        self.assertEqual(self.balance(), 15)  # 확인해도 잔액은 그대로(이미 차감됨)

    def test_confirming_twice_is_rejected(self):
        pid = self.pay(5).data['purchase']['id']
        self.act(pid, 'confirm')
        self.assertEqual(self.act(pid, 'confirm').status_code, status.HTTP_400_BAD_REQUEST)

    def test_refund_after_confirm_restores_balance(self):
        pid = self.pay(5).data['purchase']['id']
        self.act(pid, 'confirm')
        response = self.act(pid, 'refund')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.balance(), 20)

    def test_pending_list_shows_real_names(self):
        self.pay(5)
        self.client.force_authenticate(self.merchant)
        response = self.client.get('/api/merchant/purchases/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['pending']), 1)
        self.assertEqual(response.data['pending'][0]['student_name'], '학생')

    def test_today_total_counts_only_confirmed(self):
        first = self.pay(5).data['purchase']['id']
        self.pay(3)  # 대기 상태로 남겨둔다
        self.act(first, 'confirm')
        self.client.force_authenticate(self.merchant)
        response = self.client.get('/api/merchant/purchases/')
        self.assertEqual(response.data['today_total'], 5)
        self.assertEqual(response.data['today_count'], 1)

    def test_students_cannot_use_merchant_endpoints(self):
        pid = self.pay(5).data['purchase']['id']
        self.assertEqual(self.act(pid, 'confirm', as_user=self.student).status_code,
                         status.HTTP_403_FORBIDDEN)


class DonationBlockedInMarketTests(MarketTestCase):
    """시장 모드에서는 기부를 서버가 막는다(옛 화면을 켜둔 기기 대비)."""

    def donate(self):
        self.client.force_authenticate(self.student)
        return self.client.post('/api/student/donate/', {'amount': 3}, format='json')

    def test_donation_rejected_in_market_mode(self):
        self.assertEqual(self.donate().status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Donation.objects.count(), 0)

    def test_donation_allowed_in_classic_mode(self):
        self.config.mode = SiteConfig.Mode.CLASSIC
        self.config.save()
        self.assertEqual(self.donate().status_code, status.HTTP_201_CREATED)


class VerseEventTests(MarketTestCase):
    """말씀 암송 보너스 — 진행자만, 반 상관없이, 인당 하루 3개까지."""

    def give(self, student=None, undo=False, as_user=None):
        self.client.force_authenticate(as_user or self.host)
        return self.client.post(
            '/api/event/grant/',
            {'student': (student or self.other).pk, 'undo': undo}, format='json')

    def test_host_can_grant_to_a_student_outside_their_class(self):
        """진행자의 담당 반이 아니어도 줄 수 있어야 한다 — 이벤트의 핵심."""
        self.assertIsNone(self.other.teacher_id if self.other.teacher_id == self.host.pk else None)
        response = self.give(self.other)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['verse_count'], 1)
        self.assertEqual(self.balance(self.other), 1)

    def test_stops_at_three_per_student(self):
        for expected in (1, 2, 3):
            self.assertEqual(self.give().data['verse_count'], expected)
        response = self.give()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.balance(self.other), 3)

    def test_undo_removes_the_last_bonus(self):
        self.give()
        self.give()
        response = self.give(undo=True)
        self.assertEqual(response.data['verse_count'], 1)
        self.assertEqual(self.balance(self.other), 1)

    def test_undo_blocked_when_already_spent(self):
        self.give()
        self.pay(1, as_user=self.other)
        response = self.give(undo=True)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_ordinary_teacher_is_rejected(self):
        self.assertEqual(self.give(as_user=self.teacher).status_code,
                         status.HTTP_403_FORBIDDEN)

    def test_past_verse_grants_do_not_count_toward_todays_limit(self):
        """기존 주일 규칙의 '말씀 암송'은 사유가 달라 섞이지 않는다."""
        TalentGrant.objects.create(
            teacher=self.teacher, student=self.other, amount=1,
            reason='함께 예배해요 · 말씀 암송을 해요')
        for expected in (1, 2, 3):
            self.assertEqual(self.give().data['verse_count'], expected)

    def test_student_list_shows_everyone_with_balance(self):
        self.client.force_authenticate(self.host)
        response = self.client.get('/api/event/students/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['students']), 2)
        rows = {r['username']: r for r in response.data['students']}
        self.assertEqual(rows['학생']['balance'], 20)
        self.assertEqual(rows['학생']['remaining'], 3)


class ModeToggleTests(MarketTestCase):
    """관리자의 모드 전환과, 그 값이 화면으로 전달되는 경로."""

    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(
            username='관리자', password='pw', role=User.Role.ADMIN)

    def test_admin_toggles_mode(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            '/api/admin/config/', {'mode': 'classic'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(SiteConfig.get().mode, 'classic')

    def test_unknown_mode_rejected(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post('/api/admin/config/', {'mode': '축제'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(SiteConfig.get().mode, 'market')

    def test_event_host_must_be_a_teacher(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            '/api/admin/config/', {'event_host': self.student.pk}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_teachers_cannot_toggle(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post('/api/admin/config/', {'mode': 'classic'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_dashboard_carries_the_mode(self):
        """모드는 전용 API 없이 기존 폴링 응답에 실려 간다."""
        self.client.force_authenticate(self.student)
        response = self.client.get('/api/student/dashboard/')
        self.assertEqual(response.data['mode'], 'market')

    def test_teacher_payload_flags_the_event_host(self):
        self.client.force_authenticate(self.host)
        self.assertTrue(self.client.get('/api/teacher/students/').data['is_event_host'])
        self.client.force_authenticate(self.teacher)
        self.assertFalse(self.client.get('/api/teacher/students/').data['is_event_host'])

    def test_community_is_frozen_in_market_mode(self):
        self.client.force_authenticate(self.student)
        self.assertTrue(self.client.get('/api/community/').data['frozen'])


class BalanceIntegrityTests(MarketTestCase):
    """보유 달란트 = 받은 − 기부 − 사용(취소 제외)."""

    def test_refunded_purchases_do_not_reduce_balance(self):
        pid = self.pay(5).data['purchase']['id']
        self.client.force_authenticate(self.merchant)
        self.client.post(f'/api/merchant/purchases/{pid}/', {'action': 'refund'}, format='json')
        self.assertEqual(self.balance(), 20)

    def test_teacher_cannot_cancel_a_grant_the_student_already_spent(self):
        grant = TalentGrant.objects.create(
            teacher=self.teacher, student=self.student, amount=5, reason='칭찬')
        self.pay(25)  # 20 + 5 를 전부 사용
        self.client.force_authenticate(self.teacher)
        response = self.client.delete(f'/api/teacher/grant/{grant.pk}/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(TalentGrant.objects.filter(pk=grant.pk).exists())

    def test_reset_clears_purchases_too(self):
        """결제를 남긴 채 지급만 지우면 보유 달란트가 음수가 된다."""
        self.pay(5)
        admin = User.objects.create_user(
            username='관리자', password='pw', role=User.Role.ADMIN)
        self.client.force_authenticate(admin)
        response = self.client.post('/api/admin/reset-talents/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['deleted_purchases'], 1)
        self.assertEqual(Purchase.objects.count(), 0)
        self.assertEqual(self.balance(), 0)

    def test_admin_user_list_reports_spent_and_balance(self):
        self.pay(5)
        admin = User.objects.create_user(
            username='관리자', password='pw', role=User.Role.ADMIN)
        self.client.force_authenticate(admin)
        rows = {r['username']: r for r in self.client.get('/api/admin/users/').data['students']}
        self.assertEqual(rows['학생']['spent_talent'], 5)
        self.assertEqual(rows['학생']['balance'], 15)


class ConcurrencyGuardTests(MarketTestCase):
    """동시 요청으로 잔액이 음수가 되거나 확정이 덮어써지지 않는지.

    잠금(select_for_update) 자체는 PostgreSQL 에서만 동작하고 SQLite 에서는 무시된다.
    여기서 검증하는 것은 잠금과 함께 넣은 '잠근 뒤 다시 확인한다'는 판정 로직이다 —
    잠금이 걸려 순서가 정해진 뒤, 뒤늦게 도착한 요청이 옛 상태를 믿고 진행하지 않는지.
    """

    def confirm(self, purchase_id, as_user=None):
        self.client.force_authenticate(as_user or self.merchant)
        return self.client.post(
            f'/api/merchant/purchases/{purchase_id}/', {'action': 'confirm'}, format='json')

    def test_cancel_loses_to_an_already_confirmed_purchase(self):
        """아이의 무르기가 상인의 '확인 완료'를 덮어쓰면 물건은 나가고 달란트는 돌아간다."""
        pid = self.pay(5).data['purchase']['id']
        self.confirm(pid)

        self.client.force_authenticate(self.student)
        response = self.client.post(f'/api/student/purchase/{pid}/cancel/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Purchase.objects.get(pk=pid).status, Purchase.Status.DONE)
        self.assertEqual(self.balance(), 15)  # 환불되지 않았다

    def test_confirm_loses_to_an_already_cancelled_purchase(self):
        """반대 방향 — 아이가 먼저 물렀다면 상인의 확인이 되살리지 못해야 한다."""
        pid = self.pay(5).data['purchase']['id']
        self.client.force_authenticate(self.student)
        self.client.post(f'/api/student/purchase/{pid}/cancel/')

        response = self.confirm(pid)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Purchase.objects.get(pk=pid).status, Purchase.Status.REFUNDED)
        self.assertEqual(self.balance(), 20)

    def test_grant_cancel_reads_balance_after_the_purchase_lands(self):
        """선생님이 취소 화면을 열어둔 사이 아이가 결제하면, 취소는 거절돼야 한다."""
        grant = TalentGrant.objects.create(
            teacher=self.teacher, student=self.student, amount=5, reason='칭찬')
        self.assertEqual(self.balance(), 25)
        self.pay(25)  # 전액 사용

        self.client.force_authenticate(self.teacher)
        response = self.client.delete(f'/api/teacher/grant/{grant.pk}/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.balance(), 0)  # 음수가 되지 않았다

    def test_verse_undo_reads_balance_after_the_purchase_lands(self):
        self.client.force_authenticate(self.host)
        self.client.post('/api/event/grant/', {'student': self.other.pk}, format='json')
        self.pay(1, as_user=self.other)  # 받자마자 써버린다

        self.client.force_authenticate(self.host)
        response = self.client.post(
            '/api/event/grant/', {'student': self.other.pk, 'undo': True}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.balance(self.other), 0)

    def test_donation_cannot_exceed_balance(self):
        """기부도 잠근 뒤 잔액을 다시 센다(버튼 연타 대비)."""
        self.config.mode = SiteConfig.Mode.CLASSIC
        self.config.save()
        self.client.force_authenticate(self.student)
        first = self.client.post('/api/student/donate/', {'amount': 20}, format='json')
        second = self.client.post('/api/student/donate/', {'amount': 1}, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.balance(), 0)

    def test_balance_never_goes_negative_through_a_full_day(self):
        """지급 → 결제 → 환불 → 암송 → 되돌리기를 섞어도 잔액이 음수가 되지 않는다."""
        self.client.force_authenticate(self.host)
        self.client.post('/api/event/grant/', {'student': self.student.pk}, format='json')

        pid = self.pay(21).data['purchase']['id']  # 20 + 1
        self.assertEqual(self.balance(), 0)

        self.client.force_authenticate(self.merchant)
        self.client.post(f'/api/merchant/purchases/{pid}/', {'action': 'confirm'}, format='json')
        self.assertEqual(self.balance(), 0)

        self.client.force_authenticate(self.host)
        undo = self.client.post(
            '/api/event/grant/', {'student': self.student.pk, 'undo': True}, format='json')
        self.assertEqual(undo.status_code, status.HTTP_400_BAD_REQUEST)  # 이미 씀

        self.client.force_authenticate(self.merchant)
        self.client.post(f'/api/merchant/purchases/{pid}/', {'action': 'refund'}, format='json')
        self.assertEqual(self.balance(), 21)

        self.client.force_authenticate(self.host)
        undo = self.client.post(
            '/api/event/grant/', {'student': self.student.pk, 'undo': True}, format='json')
        self.assertEqual(undo.status_code, status.HTTP_200_OK)  # 환불됐으니 이제 가능
        self.assertEqual(self.balance(), 20)
