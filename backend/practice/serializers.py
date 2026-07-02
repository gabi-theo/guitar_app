from rest_framework import serializers

from .models import PracticeAttempt
from .scoring import compute_accuracy, compute_score


class PracticeAttemptSerializer(serializers.ModelSerializer):
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)
    technique_slug = serializers.CharField(source="exercise.technique.slug", read_only=True)

    class Meta:
        model = PracticeAttempt
        fields = (
            "id", "exercise", "exercise_name", "technique_slug", "bpm_target",
            "timing_accuracy", "pitch_accuracy", "accuracy", "bpm_achieved",
            "score", "verified", "created_at",
        )
        read_only_fields = ("accuracy", "score", "verified", "created_at")

    def validate(self, data):
        for field in ("timing_accuracy", "pitch_accuracy"):
            if not 0.0 <= data[field] <= 1.0:
                raise serializers.ValidationError({field: "must be between 0 and 1"})
        if data["bpm_target"] not in data["exercise"].bpm_levels:
            raise serializers.ValidationError({"bpm_target": "not a valid BPM level for this exercise"})
        return data

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        accuracy = compute_accuracy(validated_data["timing_accuracy"], validated_data["pitch_accuracy"])
        validated_data["accuracy"] = accuracy
        validated_data["score"] = compute_score(accuracy, validated_data["bpm_achieved"])
        return super().create(validated_data)
