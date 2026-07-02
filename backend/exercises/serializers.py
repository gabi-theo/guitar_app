from rest_framework import serializers

from .models import Exercise, Technique

VALID_MARKERS = {"pick", "hammer", "pull", "tap", "slide"}


class TechniqueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Technique
        fields = ("id", "slug", "name", "description")


class ExerciseListSerializer(serializers.ModelSerializer):
    technique = TechniqueSerializer(read_only=True)
    is_custom = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = Exercise
        fields = (
            "id", "technique", "name", "description", "difficulty", "bpm_levels",
            "visibility", "is_custom", "is_owner", "owner_name",
        )
        read_only_fields = ("visibility",)

    def get_is_custom(self, obj):
        return obj.created_by_id is not None

    def get_is_owner(self, obj):
        request = self.context.get("request")
        return bool(request and obj.created_by_id == request.user.id)

    def get_owner_name(self, obj):
        if obj.created_by_id is None:
            return None
        return obj.created_by.display_name or obj.created_by.username


class ExerciseDetailSerializer(ExerciseListSerializer):
    """Read detail + write serializer for custom exercises."""

    technique_id = serializers.PrimaryKeyRelatedField(
        queryset=Technique.objects.all(), source="technique", write_only=True
    )

    class Meta(ExerciseListSerializer.Meta):
        fields = ExerciseListSerializer.Meta.fields + ("note_pattern", "technique_id")
        read_only_fields = ()  # visibility is writable on custom exercises

    def validate_note_pattern(self, pattern):
        if not isinstance(pattern, list) or not pattern:
            raise serializers.ValidationError("must be a non-empty list of notes")
        if len(pattern) > 256:
            raise serializers.ValidationError("too many notes (max 256)")
        for i, note in enumerate(pattern):
            if not isinstance(note, dict):
                raise serializers.ValidationError(f"note {i + 1}: must be an object")
            string = note.get("string")
            fret = note.get("fret")
            duration = note.get("duration")
            marker = note.get("technique_marker")
            if not (isinstance(string, int) and 1 <= string <= 6):
                raise serializers.ValidationError(f"note {i + 1}: string must be 1-6")
            if not (isinstance(fret, int) and 0 <= fret <= 24):
                raise serializers.ValidationError(f"note {i + 1}: fret must be 0-24")
            if not (isinstance(duration, (int, float)) and 0 < duration <= 4):
                raise serializers.ValidationError(f"note {i + 1}: duration must be in (0, 4] beats")
            if marker not in VALID_MARKERS:
                raise serializers.ValidationError(
                    f"note {i + 1}: technique_marker must be one of {sorted(VALID_MARKERS)}"
                )
        return pattern

    def validate_bpm_levels(self, levels):
        if not isinstance(levels, list) or not levels:
            raise serializers.ValidationError("must be a non-empty list of BPM values")
        if len(levels) > 12:
            raise serializers.ValidationError("too many BPM levels (max 12)")
        for bpm in levels:
            if not (isinstance(bpm, int) and 30 <= bpm <= 300):
                raise serializers.ValidationError("each BPM must be an integer between 30 and 300")
        if levels != sorted(set(levels)):
            raise serializers.ValidationError("BPM levels must be strictly ascending")
        return levels
