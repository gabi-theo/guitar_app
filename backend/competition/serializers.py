from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Challenge

User = get_user_model()


class LeaderboardEntrySerializer(serializers.Serializer):
    """Computed from best PracticeAttempt per user — not stored."""

    rank = serializers.IntegerField()
    user_id = serializers.IntegerField(source="user.id")
    username = serializers.CharField(source="user.username")
    display_name = serializers.CharField(source="user.display_name")
    bpm_target = serializers.IntegerField()
    accuracy = serializers.FloatField()
    score = serializers.FloatField()
    created_at = serializers.DateTimeField()


class ChallengeSerializer(serializers.ModelSerializer):
    opponent_username = serializers.CharField(write_only=True)
    challenger_name = serializers.CharField(source="challenger.username", read_only=True)
    opponent_name = serializers.CharField(source="opponent.username", read_only=True)
    winner_name = serializers.CharField(source="winner.username", read_only=True, allow_null=True)
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)
    challenger_score = serializers.FloatField(source="challenger_attempt.score", read_only=True, allow_null=True)
    opponent_score = serializers.FloatField(source="opponent_attempt.score", read_only=True, allow_null=True)

    class Meta:
        model = Challenge
        fields = (
            "id", "challenger", "challenger_name", "opponent_name", "opponent_username",
            "exercise", "exercise_name", "bpm_target", "status",
            "challenger_score", "opponent_score", "winner", "winner_name",
            "created_at", "resolved_at",
        )
        read_only_fields = ("challenger", "status", "winner", "created_at", "resolved_at")

    def validate(self, data):
        request = self.context["request"]
        try:
            opponent = User.objects.get(username=data.pop("opponent_username"))
        except User.DoesNotExist:
            raise serializers.ValidationError({"opponent_username": "no such user"})
        if opponent == request.user:
            raise serializers.ValidationError({"opponent_username": "you cannot challenge yourself"})
        if data["bpm_target"] not in data["exercise"].bpm_levels:
            raise serializers.ValidationError({"bpm_target": "not a valid BPM level for this exercise"})
        data["opponent"] = opponent
        data["challenger"] = request.user
        return data
