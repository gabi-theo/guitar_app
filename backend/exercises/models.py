from django.conf import settings
from django.db import models
from django.db.models import Q


class Technique(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


class ExerciseQuerySet(models.QuerySet):
    def visible_to(self, user):
        """System exercises (created_by NULL), the user's own, and shared customs."""
        return self.filter(
            Q(created_by__isnull=True) | Q(created_by=user) | Q(visibility=Exercise.VISIBILITY_SHARED)
        )


class Exercise(models.Model):
    """A predefined or user-created exercise.

    `note_pattern` is the single source of truth for what should be played,
    shared by the tab renderer, preview synth, and scoring engine. Schema:
    ordered list of notes, each:
        {
          "string": 1-6,          # 1 = high E, 6 = low E (standard tuning)
          "fret": 0-24,
          "duration": float,      # in beats (quarter note = 1.0)
          "technique_marker": "pick" | "hammer" | "pull" | "tap" | "slide"
        }
    `bpm_levels` is the preset list of selectable tempos, e.g. [60, 80, ...].
    """

    DIFFICULTY_CHOICES = [(1, "Beginner"), (2, "Intermediate"), (3, "Advanced"), (4, "Expert")]

    VISIBILITY_PRIVATE = "private"
    VISIBILITY_SHARED = "shared"
    VISIBILITY_CHOICES = [(VISIBILITY_PRIVATE, "Private"), (VISIBILITY_SHARED, "Shared")]

    technique = models.ForeignKey(Technique, on_delete=models.CASCADE, related_name="exercises")
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    difficulty = models.PositiveSmallIntegerField(choices=DIFFICULTY_CHOICES, default=1)
    note_pattern = models.JSONField()
    bpm_levels = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    # NULL = system exercise from the seed catalog; set = user-created custom exercise.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True,
        related_name="custom_exercises",
    )
    visibility = models.CharField(max_length=10, choices=VISIBILITY_CHOICES, default=VISIBILITY_PRIVATE)

    objects = ExerciseQuerySet.as_manager()

    class Meta:
        ordering = ["technique", "difficulty", "name"]

    def __str__(self):
        return f"{self.technique.slug}: {self.name}"
