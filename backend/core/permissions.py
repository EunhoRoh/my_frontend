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
