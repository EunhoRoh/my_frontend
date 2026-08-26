from rest_framework.permissions import BasePermission

from .models import User


class IsTeacher(BasePermission):
    message = '선생님만 사용할 수 있습니다.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.role == User.Role.TEACHER)


class IsStudent(BasePermission):
    message = '학생만 사용할 수 있습니다.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.role == User.Role.STUDENT)


class IsAdmin(BasePermission):
    message = '관리자만 사용할 수 있습니다.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and (request.user.role == User.Role.ADMIN or request.user.is_superuser)
        )


class IsMerchant(BasePermission):
    message = '상인만 사용할 수 있습니다.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.role == User.Role.MERCHANT)


class IsEventHost(BasePermission):
    """암송 이벤트 진행자에게만 열리는 권한.

    이 사람만 '담당 반' 제한 없이 전체 학생에게 보너스 달란트를 줄 수 있다.
    누구인지는 코드가 아니라 운영 설정(SiteConfig.event_host)이 정하므로,
    담당이 바뀌어도 관리자 화면에서 고르면 된다.
    """

    message = '암송 이벤트 담당 선생님만 사용할 수 있습니다.'

    def has_permission(self, request, view):
        from .models import SiteConfig
        if not request.user or request.user.role != User.Role.TEACHER:
            return False
        return SiteConfig.get().event_host_id == request.user.pk
