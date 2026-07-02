from django.conf import settings
from django.db import models
from django.utils import timezone


class Challenge(models.Model):
    """Async player-vs-player duel: both sides play the same exercise at the
    same BPM whenever they like; resolves automatically once both attempts
    are in. Scores come from the normal practice flow (client-scored — the
    upload re-verification pipeline was cut from scope)."""

    STATUS_OPEN = "open"
    STATUS_COMPLETE = "complete"
    STATUS_DECLINED = "declined"
    STATUS_CHOICES = [
        (STATUS_OPEN, "Open"),
        (STATUS_COMPLETE, "Complete"),
        (STATUS_DECLINED, "Declined"),
    ]

    challenger = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="challenges_sent"
    )
    opponent = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="challenges_received"
    )
    exercise = models.ForeignKey("exercises.Exercise", on_delete=models.CASCADE)
    bpm_target = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_OPEN)
    challenger_attempt = models.ForeignKey(
        "practice.PracticeAttempt", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    opponent_attempt = models.ForeignKey(
        "practice.PracticeAttempt", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    winner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.challenger} vs {self.opponent} · {self.exercise} @ {self.bpm_target}bpm"

    def attempt_for(self, user):
        if user == self.challenger:
            return self.challenger_attempt
        if user == self.opponent:
            return self.opponent_attempt
        return None

    def set_attempt_for(self, user, attempt):
        if user == self.challenger:
            self.challenger_attempt = attempt
        elif user == self.opponent:
            self.opponent_attempt = attempt

    def maybe_resolve(self):
        """Complete the challenge once both sides have played (draw on tie)."""
        if self.status != self.STATUS_OPEN:
            return
        if self.challenger_attempt is None or self.opponent_attempt is None:
            return
        self.status = self.STATUS_COMPLETE
        self.resolved_at = timezone.now()
        if self.challenger_attempt.score > self.opponent_attempt.score:
            self.winner = self.challenger
        elif self.opponent_attempt.score > self.challenger_attempt.score:
            self.winner = self.opponent
        else:
            self.winner = None  # draw
