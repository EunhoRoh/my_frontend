from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import User, TalentGrant, Donation


def tree_stage(total):
    """Map a talent total to a 0-4 growth stage (matches the frontend)."""
    if total >= 40:
        return 4
    if total >= 30:
        return 3
    if total >= 20:
        return 2
    if total >= 10:
        return 1
    return 0


class RegisterSerializer(serializers.Serializer):
    """Self sign-up: name + password. Defaults to the student role."""

    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=4)

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('이름을 입력해 주세요.')
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('이미 사용 중인 이름입니다.')
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            password=validated_data['password'],
            role=User.Role.STUDENT,
        )


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(username=attrs['username'].strip(), password=attrs['password'])
        if not user:
            raise serializers.ValidationError('이름 또는 비밀번호가 올바르지 않습니다.')
        attrs['user'] = user
        return attrs


class UserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)
    received_talent = serializers.IntegerField(read_only=True)
    donated_talent = serializers.IntegerField(read_only=True)
    balance = serializers.IntegerField(read_only=True)
    stage = serializers.SerializerMethodField()
    teacher_name = serializers.CharField(source='teacher.username', read_only=True, default=None)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'role', 'role_display',
            'received_talent', 'donated_talent', 'balance', 'stage',
            'teacher', 'teacher_name',
        ]

    def get_stage(self, obj):
        return tree_stage(obj.received_talent) if obj.is_student else None


class StudentBriefSerializer(serializers.ModelSerializer):
    """Compact student card for teacher/admin lists."""

    received_talent = serializers.IntegerField(read_only=True)
    donated_talent = serializers.IntegerField(read_only=True)
    balance = serializers.IntegerField(read_only=True)
    stage = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'received_talent', 'donated_talent', 'balance',
                  'stage', 'teacher', 'teacher_name']

    teacher_name = serializers.CharField(source='teacher.username', read_only=True, default=None)

    def get_stage(self, obj):
        return tree_stage(obj.received_talent)


class TalentGrantSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.username', read_only=True)
    student_name = serializers.CharField(source='student.username', read_only=True)

    class Meta:
        model = TalentGrant
        fields = ['id', 'teacher', 'teacher_name', 'student', 'student_name',
                  'amount', 'reason', 'created_at']
        read_only_fields = ['teacher']


class DonationSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.username', read_only=True)

    class Meta:
        model = Donation
        fields = ['id', 'student', 'student_name', 'amount', 'message', 'created_at']
        read_only_fields = ['student']
