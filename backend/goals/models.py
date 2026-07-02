from django.conf import settings
from django.db import models


class DailyChallenge(models.Model):
    """One auto-generated per-user goal for a single day.

    Three kinds are generated each day from the user's practice history:
      consolidate — lock in the current level (high accuracy at a known BPM)
      push        — one BPM level above the current clean level
      explore     — an exercise from the least-practiced technique
    Completed automatically when a matching PracticeAttempt lands (same
    exercise, bpm_target >= challenge target, accuracy >= target).
    """

    KIND_CONSOLIDATE = "consolidate"
    KIND_PUSH = "push"
    KIND_EXPLORE = "explore"
    KIND_CHOICES = [
        (KIND_CONSOLIDATE, "Consolidate"),
        (KIND_PUSH, "Push"),
        (KIND_EXPLORE, "Explore"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="daily_challenges"
    )
    date = models.DateField()
    kind = models.CharField(max_length=12, choices=KIND_CHOICES)
    exercise = models.ForeignKey("exercises.Exercise", on_delete=models.CASCADE, related_name="+")
    bpm_target = models.PositiveIntegerField()
    target_accuracy = models.FloatField()
    title = models.CharField(max_length=200)
    completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["date", "id"]
        constraints = [
            models.UniqueConstraint(fields=["user", "date", "kind"], name="unique_daily_challenge_kind"),
        ]
        indexes = [models.Index(fields=["user", "date"])]

    def __str__(self):
        return f"{self.user} · {self.date} · {self.title}"


class Objective(models.Model):
    """Long-running personal goal: reach `target_bpm` at `target_accuracy` on
    an exercise by a date.

    `initial_target_date` is the user's original plan and never changes.
    `target_date` auto-adjusts: after each relevant attempt it is re-projected
    from the measured progress rate (effective BPM gained per day since the
    objective was created), so it moves earlier when practice goes well and
    later when it doesn't.
    """

    STATUS_ACTIVE = "active"
    STATUS_ACHIEVED = "achieved"
    STATUS_CHOICES = [(STATUS_ACTIVE, "Active"), (STATUS_ACHIEVED, "Achieved")]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="objectives"
    )
    exercise = models.ForeignKey("exercises.Exercise", on_delete=models.CASCADE, related_name="+")
    target_bpm = models.PositiveIntegerField()
    target_accuracy = models.FloatField(default=0.8)
    initial_target_date = models.DateField()
    target_date = models.DateField()
    # effective BPM = bpm_target * min(1, accuracy / target_accuracy) — a single
    # progress number that rewards both speed and cleanliness.
    start_effective_bpm = models.FloatField(default=0.0)
    best_effective_bpm = models.FloatField(default=0.0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    achieved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["status", "target_date", "id"]
        indexes = [models.Index(fields=["user", "status"])]

    def __str__(self):
        return f"{self.user} · {self.exercise} → {self.target_bpm}bpm by {self.target_date}"
