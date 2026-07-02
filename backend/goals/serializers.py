from django.utils import timezone
from rest_framework import serializers

from .models import DailyChallenge, Objective
from .services import best_effective_bpm, refresh_objective


class DailyChallengeSerializer(serializers.ModelSerializer):
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)
    technique_slug = serializers.CharField(source="exercise.technique.slug", read_only=True)
    technique_name = serializers.CharField(source="exercise.technique.name", read_only=True)

    class Meta:
        model = DailyChallenge
        fields = (
            "id", "date", "kind", "exercise", "exercise_name", "technique_slug",
            "technique_name", "bpm_target", "target_accuracy", "title",
            "completed", "completed_at",
        )


class ObjectiveSerializer(serializers.ModelSerializer):
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)
    technique_name = serializers.CharField(source="exercise.technique.name", read_only=True)
    progress_percent = serializers.SerializerMethodField()
    days_adjustment = serializers.SerializerMethodField()

    class Meta:
        model = Objective
        fields = (
            "id", "exercise", "exercise_name", "technique_name",
            "target_bpm", "target_accuracy", "initial_target_date", "target_date",
            "start_effective_bpm", "best_effective_bpm", "progress_percent",
            "days_adjustment", "status", "created_at", "achieved_at",
        )
        read_only_fields = (
            "initial_target_date", "start_effective_bpm", "best_effective_bpm",
            "status", "created_at", "achieved_at",
        )

    def get_progress_percent(self, obj):
        if obj.status == Objective.STATUS_ACHIEVED:
            return 100
        span = obj.target_bpm - obj.start_effective_bpm
        if span <= 0:
            return 0
        gained = obj.best_effective_bpm - obj.start_effective_bpm
        return round(max(0.0, min(1.0, gained / span)) * 100)

    def get_days_adjustment(self, obj):
        """Negative = ahead of the original plan, positive = behind."""
        return (obj.target_date - obj.initial_target_date).days

    def validate_target_accuracy(self, value):
        if not 0.5 <= value <= 1.0:
            raise serializers.ValidationError("must be between 0.5 and 1.0")
        return value

    def validate(self, data):
        exercise = data["exercise"]
        if data["target_bpm"] not in (exercise.bpm_levels or []):
            raise serializers.ValidationError({"target_bpm": "not a valid BPM level for this exercise"})
        if data["target_date"] <= timezone.localdate():
            raise serializers.ValidationError({"target_date": "must be in the future"})
        return data

    def create(self, validated_data):
        user = self.context["request"].user
        target_accuracy = validated_data.get("target_accuracy", 0.8)
        start = best_effective_bpm(user, validated_data["exercise"], target_accuracy)
        objective = Objective.objects.create(
            user=user,
            initial_target_date=validated_data["target_date"],
            start_effective_bpm=start,
            best_effective_bpm=start,
            **validated_data,
        )
        # settle immediately in case the target is already met by past attempts
        return refresh_objective(objective)
