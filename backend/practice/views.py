from datetime import timedelta

from django.db.models import Avg, Count, Max
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import filters, mixins, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PracticeAttempt
from .serializers import PracticeAttemptSerializer


class PracticeAttemptViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Create and list the requesting user's own attempts.

    List filters: ?exercise=<id>, ?technique=<slug>, ?bpm=<target>
    Ordering:     ?ordering=-score (created_at, score, accuracy, bpm_target,
                  timing_accuracy, pitch_accuracy)
    """

    serializer_class = PracticeAttemptSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = [
        "created_at", "score", "accuracy", "bpm_target",
        "timing_accuracy", "pitch_accuracy",
    ]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = (
            PracticeAttempt.objects.filter(user=self.request.user)
            .select_related("exercise", "exercise__technique")
        )
        params = self.request.query_params
        exercise = params.get("exercise")
        if exercise and exercise.isdigit():
            qs = qs.filter(exercise_id=exercise)
        technique = params.get("technique")
        if technique:
            qs = qs.filter(exercise__technique__slug=technique)
        bpm = params.get("bpm")
        if bpm and bpm.isdigit():
            qs = qs.filter(bpm_target=bpm)
        return qs


CLEAN_ACCURACY = 0.8


def _current_streak(days: set, today) -> int:
    """Consecutive practice days ending today (or yesterday, so an unfinished
    today doesn't zero the streak)."""
    day = today if today in days else today - timedelta(days=1)
    streak = 0
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak


class StatsOverviewView(APIView):
    """GET /api/stats/overview/ — headline numbers plus a per-technique breakdown."""

    def get(self, request):
        attempts = PracticeAttempt.objects.filter(user=request.user)
        today = timezone.localdate()

        day_rows = attempts.annotate(day=TruncDate("created_at")).values_list("day", flat=True)
        days = set(day_rows)

        last_30 = attempts.filter(created_at__gte=timezone.now() - timedelta(days=30))
        best = attempts.order_by("-score").select_related("exercise").first()

        technique_rows = (
            attempts.values(
                "exercise__technique__slug",
                "exercise__technique__name",
            )
            .annotate(
                attempts=Count("id"),
                best_score=Max("score"),
                avg_accuracy=Avg("accuracy"),
                last_practiced=Max("created_at"),
            )
            .order_by("-attempts")
        )
        # best clean BPM per technique: highest bpm_target reached at >= CLEAN_ACCURACY
        clean_rows = (
            attempts.filter(accuracy__gte=CLEAN_ACCURACY)
            .values("exercise__technique__slug")
            .annotate(best_clean_bpm=Max("bpm_target"))
        )
        clean_by_slug = {r["exercise__technique__slug"]: r["best_clean_bpm"] for r in clean_rows}

        return Response({
            "total_attempts": attempts.count(),
            "practice_days": len(days),
            "current_streak": _current_streak(days, today),
            "best_score": best.score if best else None,
            "best_score_exercise": best.exercise.name if best else None,
            "attempts_30d": last_30.count(),
            "avg_accuracy_30d": last_30.aggregate(v=Avg("accuracy"))["v"],
            "techniques": [
                {
                    "slug": r["exercise__technique__slug"],
                    "name": r["exercise__technique__name"],
                    "attempts": r["attempts"],
                    "best_score": r["best_score"],
                    "avg_accuracy": r["avg_accuracy"],
                    "best_clean_bpm": clean_by_slug.get(r["exercise__technique__slug"]),
                    "last_practiced": r["last_practiced"],
                }
                for r in technique_rows
            ],
        })


class StatsProgressView(APIView):
    """GET /api/stats/progress/?days=90[&technique=<slug>][&exercise=<id>]
    Per-day aggregates for the evolution charts."""

    def get(self, request):
        params = request.query_params
        try:
            days = min(max(int(params.get("days", 90)), 7), 365)
        except ValueError:
            days = 90
        since = timezone.now() - timedelta(days=days)

        qs = PracticeAttempt.objects.filter(user=request.user, created_at__gte=since)
        technique = params.get("technique")
        if technique:
            qs = qs.filter(exercise__technique__slug=technique)
        exercise = params.get("exercise")
        if exercise and exercise.isdigit():
            qs = qs.filter(exercise_id=exercise)

        rows = (
            qs.annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(
                attempts=Count("id"),
                best_score=Max("score"),
                avg_accuracy=Avg("accuracy"),
                max_bpm=Max("bpm_target"),
            )
            .order_by("day")
        )
        return Response({
            "days": days,
            "series": [
                {
                    "date": r["day"].isoformat(),
                    "attempts": r["attempts"],
                    "best_score": r["best_score"],
                    "avg_accuracy": r["avg_accuracy"],
                    "max_bpm": r["max_bpm"],
                }
                for r in rows
            ],
        })
