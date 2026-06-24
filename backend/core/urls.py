from django.urls import path

from . import views

urlpatterns = [
    # auth
    path('auth/register/', views.register),
    path('auth/login/', views.login),
    path('auth/logout/', views.logout),
    path('me/', views.me),

    # shared
    path('community/', views.community),

    # student
    path('student/dashboard/', views.StudentDashboard.as_view()),
    path('student/donate/', views.DonateView.as_view()),

    # teacher
    path('teacher/students/', views.TeacherStudents.as_view()),
    path('teacher/grant/', views.GrantView.as_view()),

    # admin
    path('admin/users/', views.AdminUsers.as_view()),
    path('admin/assign/', views.AssignStudent.as_view()),
    path('admin/set-role/', views.SetRole.as_view()),
    path('admin/stats/', views.AdminStats.as_view()),
]
