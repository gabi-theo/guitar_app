from django.conf import settings
from django.db import models


class PracticeAttempt(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attempts")
    exercise = models.ForeignKey("exercises.Exercise", on_delete=models.CASCADE, related_name="attempts")
    bpm_target = models.PositiveIntegerField()
    timing_accuracy = models.FloatField()
    pitch_accuracy = models.FloatField()
    accuracy = models.FloatField()
    bpm_achieved = models.FloatField()
    score = models.FloatField()
    # Phase 2: client-recorded audio uploaded for server-side re-verification.
    audio = models.FileField(upload_to="attempts/%Y/%m/", null=True, blank=True)
    verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "exercise", "-created_at"]),
            models.Index(fields=["exercise", "bpm_target", "verified", "-score"]),
        ]

    def __str__(self):
        return f"{self.user} · {self.exercise} @ {self.bpm_target}bpm → {self.score}"
