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
    path('community/display/', views.community_display),  # public, for event-day big screen

    # student
    path('student/dashboard/', views.StudentDashboard.as_view()),
    path('student/donate/', views.DonateView.as_view()),
    path('student/purchase/', views.PurchaseView.as_view()),          # 달란트 내기
    path('student/purchase/<int:pk>/cancel/', views.PurchaseCancel.as_view()),  # 확인 전 무르기

    # teacher
    path('teacher/students/', views.TeacherStudents.as_view()),
    path('teacher/grant/', views.GrantView.as_view()),
    path('teacher/grant/<int:pk>/', views.GrantDetail.as_view()),  # 오늘 준 달란트 취소

    # 달란트 상점 (상인)
    path('merchant/purchases/', views.MerchantPurchases.as_view()),
    path('merchant/purchases/<int:pk>/', views.MerchantPurchases.as_view()),  # 확인·취소

    # 말씀 암송 이벤트 (진행자 전용)
    path('event/students/', views.EventStudents.as_view()),
    path('event/grant/', views.EventGrant.as_view()),

    # admin
    path('admin/users/', views.AdminUsers.as_view()),
    path('admin/donations/', views.AdminDonations.as_view()),
    path('admin/assign/', views.AssignStudent.as_view()),
    path('admin/set-role/', views.SetRole.as_view()),
    path('admin/delete-user/', views.DeleteUser.as_view()),
    path('admin/stats/', views.AdminStats.as_view()),
    path('admin/config/', views.AdminConfig.as_view()),  # 기본 ⇄ 달란트 시장 전환
    path('admin/reset-talents/', views.ResetTalents.as_view()),
]
