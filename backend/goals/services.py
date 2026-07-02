"""Daily-challenge generation and objective progress/projection math."""

import math
from datetime import timedelta

from django.db.models import Count, Max
from django.utils import timezone

from exercises.models import Exercise
from practice.models import PracticeAttempt

from .models import DailyChallenge, Objective

CLEAN_ACCURACY = 0.8  # "you own this tempo" threshold
MAX_PROJECTION_DAYS = 730


def effective_bpm(bpm_target: int, accuracy: float, target_accuracy: float) -> float:
    """One progress number rewarding speed and cleanliness together."""
    if target_accuracy <= 0:
        return float(bpm_target)
    return bpm_target * min(1.0, accuracy / target_accuracy)


def best_effective_bpm(user, exercise, target_accuracy: float) -> float:
    rows = PracticeAttempt.objects.filter(user=user, exercise=exercise).values("bpm_target", "accuracy")
    return max(
        (effective_bpm(r["bpm_target"], r["accuracy"], target_accuracy) for r in rows),
        default=0.0,
    )


def best_clean_bpm(user, exercise, min_accuracy: float = CLEAN_ACCURACY):
    """Highest BPM level the user has played with accuracy >= min_accuracy."""
    rows = (
        PracticeAttempt.objects.filter(user=user, exercise=exercise)
        .values("bpm_target")
        .annotate(best=Max("accuracy"))
    )
    clean = [r["bpm_target"] for r in rows if r["best"] >= min_accuracy]
    return max(clean) if clean else None


# --- daily challenges ---------------------------------------------------


def ensure_daily_challenges(user, day=None):
    """Return today's challenges, generating them on first request of the day."""
    day = day or timezone.localdate()
    qs = DailyChallenge.objects.filter(user=user, date=day).select_related(
        "exercise", "exercise__technique"
    )
    existing = list(qs)
    if existing:
        return existing
    _generate_daily_challenges(user, day)
    return list(qs.all())


def _generate_daily_challenges(user, day):
    exercises = [
        e
        for e in Exercise.objects.filter(is_active=True).visible_to(user).select_related("technique")
        if e.bpm_levels
    ]
    if not exercises:
        return
    by_id = {e.id: e for e in exercises}
    plans = []  # (kind, exercise, bpm, target_accuracy, title)

    last = (
        PracticeAttempt.objects.filter(user=user, exercise_id__in=by_id)
        .order_by("-created_at")
        .first()
    )
    # focus = the last-practiced exercise; new users focus on the easiest one
    focus = by_id.get(last.exercise_id) if last else None
    if focus is None:
        focus = min(exercises, key=lambda e: (e.difficulty, e.id))

    clean = best_clean_bpm(user, focus)
    base = clean or focus.bpm_levels[0]
    consolidate_accuracy = 0.85 if clean else 0.6
    plans.append((
        DailyChallenge.KIND_CONSOLIDATE, focus, base, consolidate_accuracy,
        f"Nail “{focus.name}” at {base} BPM with {int(consolidate_accuracy * 100)}%+ accuracy",
    ))
    next_level = next((b for b in focus.bpm_levels if b > base), None)
    if next_level:
        plans.append((
            DailyChallenge.KIND_PUSH, focus, next_level, 0.7,
            f"Push “{focus.name}” up to {next_level} BPM (70%+ accuracy)",
        ))
    else:
        plans.append((
            DailyChallenge.KIND_PUSH, focus, base, 0.95,
            f"Own it: “{focus.name}” at {base} BPM with 95%+ accuracy",
        ))

    # explore: easiest exercise from the least-practiced technique
    counts = {
        r["exercise__technique_id"]: r["n"]
        for r in PracticeAttempt.objects.filter(user=user, exercise_id__in=by_id)
        .values("exercise__technique_id")
        .annotate(n=Count("id"))
    }
    used = {p[1].id for p in plans}
    candidates = [e for e in exercises if e.id not in used]
    if candidates:
        candidates.sort(key=lambda e: (counts.get(e.technique_id, 0), e.difficulty, e.id))
        ex = candidates[0]
        plans.append((
            DailyChallenge.KIND_EXPLORE, ex, ex.bpm_levels[0], 0.6,
            f"Explore {ex.technique.name}: “{ex.name}” at {ex.bpm_levels[0]} BPM",
        ))

    DailyChallenge.objects.bulk_create(
        [
            DailyChallenge(
                user=user, date=day, kind=kind, exercise=ex,
                bpm_target=bpm, target_accuracy=acc, title=title,
            )
            for kind, ex, bpm, acc, title in plans
        ],
        ignore_conflicts=True,  # two racing first-requests generate once
    )


# --- objectives ----------------------------------------------------------


def target_met(objective) -> bool:
    return PracticeAttempt.objects.filter(
        user=objective.user,
        exercise=objective.exercise,
        bpm_target__gte=objective.target_bpm,
        accuracy__gte=objective.target_accuracy,
    ).exists()


def projected_date(objective, today):
    """Linear projection of when the target will be reached, from the
    effective-BPM gain per day since the objective was created. None = no
    trend yet (no gain, or created today)."""
    remaining = objective.target_bpm - objective.best_effective_bpm
    if remaining <= 0:
        return today
    elapsed_days = (today - timezone.localdate(objective.created_at)).days
    gained = objective.best_effective_bpm - objective.start_effective_bpm
    if elapsed_days < 1 or gained <= 0:
        return None
    days_left = min(math.ceil(remaining / (gained / elapsed_days)), MAX_PROJECTION_DAYS)
    return today + timedelta(days=days_left)


def refresh_objective(objective, save=True):
    """Recompute progress, adjust the target date, and settle achievement."""
    today = timezone.localdate()
    best = best_effective_bpm(objective.user, objective.exercise, objective.target_accuracy)
    objective.best_effective_bpm = max(best, objective.start_effective_bpm)

    if objective.status == Objective.STATUS_ACTIVE:
        if target_met(objective):
            objective.status = Objective.STATUS_ACHIEVED
            objective.achieved_at = timezone.now()
            objective.target_date = today
        else:
            projection = projected_date(objective, today)
            if projection is not None:
                objective.target_date = max(projection, today + timedelta(days=1))
    if save:
        objective.save()
    return objective
