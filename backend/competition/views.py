from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from practice.models import PracticeAttempt

from .models import Challenge
from .serializers import ChallengeSerializer, LeaderboardEntrySerializer


class LeaderboardView(APIView):
    """Global leaderboard for one exercise: each user's single best attempt,
    ranked by score. Computed on read — nothing stored.

    GET /api/leaderboard/?exercise=<id>[&bpm=<level>]
    """

    def get(self, request):
        exercise = request.query_params.get("exercise")
        if not exercise or not exercise.isdigit():
            return Response({"detail": "exercise query param is required"}, status=400)

        qs = PracticeAttempt.objects.filter(exercise_id=exercise).select_related("user")
        bpm = request.query_params.get("bpm")
        if bpm and bpm.isdigit():
            qs = qs.filter(bpm_target=bpm)

        # Postgres DISTINCT ON: best attempt per user, then rank by score
        best = qs.order_by("user_id", "-score", "created_at").distinct("user_id")
        entries = sorted(best, key=lambda a: (-a.score, a.created_at))[:100]
        for i, entry in enumerate(entries):
            entry.rank = i + 1
        return Response(LeaderboardEntrySerializer(entries, many=True).data)


class ChallengeViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ChallengeSerializer
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        return (
            Challenge.objects.filter(Q(challenger=user) | Q(opponent=user))
            .select_related(
                "challenger", "opponent", "winner", "exercise",
                "challenger_attempt", "opponent_attempt",
            )
        )

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """Attach one of my attempts to this challenge; resolves when both are in."""
        challenge = self.get_object()
        if challenge.status != Challenge.STATUS_OPEN:
            return Response({"detail": "challenge is not open"}, status=status.HTTP_400_BAD_REQUEST)
        if challenge.attempt_for(request.user) is not None:
            return Response({"detail": "you already submitted an attempt"}, status=status.HTTP_400_BAD_REQUEST)

        attempt_id = request.data.get("attempt")
        try:
            attempt = PracticeAttempt.objects.get(pk=attempt_id, user=request.user)
        except (PracticeAttempt.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "attempt not found"}, status=status.HTTP_400_BAD_REQUEST)
        if attempt.exercise_id != challenge.exercise_id or attempt.bpm_target != challenge.bpm_target:
            return Response(
                {"detail": "attempt must match the challenge exercise and BPM"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        challenge.set_attempt_for(request.user, attempt)
        challenge.maybe_resolve()
        challenge.save()
        return Response(self.get_serializer(challenge).data)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        challenge = self.get_object()
        if request.user != challenge.opponent:
            return Response({"detail": "only the opponent can decline"}, status=status.HTTP_403_FORBIDDEN)
        if challenge.status != Challenge.STATUS_OPEN or challenge.opponent_attempt is not None:
            return Response({"detail": "challenge can no longer be declined"}, status=status.HTTP_400_BAD_REQUEST)
        challenge.status = Challenge.STATUS_DECLINED
        challenge.save()
        return Response(self.get_serializer(challenge).data)
