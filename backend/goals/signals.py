from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from practice.models import PracticeAttempt

from .models import DailyChallenge, Objective
from .services import refresh_objective


@receiver(post_save, sender=PracticeAttempt)
def apply_attempt_to_goals(sender, instance, created, **kwargs):
    """Every new attempt can complete daily challenges and move objectives."""
    if not created:
        return
    day = timezone.localdate(instance.created_at)
    DailyChallenge.objects.filter(
        user=instance.user,
        date=day,
        exercise=instance.exercise,
        completed=False,
        bpm_target__lte=instance.bpm_target,
        target_accuracy__lte=instance.accuracy,
    ).update(completed=True, completed_at=timezone.now())

    for objective in Objective.objects.filter(
        user=instance.user, exercise=instance.exercise, status=Objective.STATUS_ACTIVE
    ):
        refresh_objective(objective)
