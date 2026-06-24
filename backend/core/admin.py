from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User, TalentGrant, Donation


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'role', 'teacher', 'received_talent', 'donated_talent', 'is_staff')
    list_filter = ('role', 'is_staff')
    list_editable = ('role', 'teacher')
    search_fields = ('username',)
    fieldsets = BaseUserAdmin.fieldsets + (
        ('성령의 나무', {'fields': ('role', 'teacher')}),
    )

    @admin.display(description='받은 달란트')
    def received_talent(self, obj):
        return obj.received_talent

    @admin.display(description='기부 달란트')
    def donated_talent(self, obj):
        return obj.donated_talent


@admin.register(TalentGrant)
class TalentGrantAdmin(admin.ModelAdmin):
    list_display = ('student', 'teacher', 'amount', 'reason', 'created_at')
    list_filter = ('teacher',)
    search_fields = ('student__username', 'teacher__username', 'reason')


@admin.register(Donation)
class DonationAdmin(admin.ModelAdmin):
    list_display = ('student', 'amount', 'message', 'created_at')
    search_fields = ('student__username', 'message')
