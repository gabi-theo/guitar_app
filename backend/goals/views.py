from rest_framework import mixins, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Objective
from .serializers import DailyChallengeSerializer, ObjectiveSerializer
from .services import ensure_daily_challenges


class DailyChallengeView(APIView):
    """GET /api/goals/daily/ — today's challenges, generated on first request."""

    def get(self, request):
        challenges = ensure_daily_challenges(request.user)
        return Response(DailyChallengeSerializer(challenges, many=True).data)


class ObjectiveViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """The requesting user's objectives. Progress and the adjusted target date
    are refreshed by the attempt signal; list returns stored state."""

    serializer_class = ObjectiveSerializer
    pagination_class = None

    def get_queryset(self):
        return Objective.objects.filter(user=self.request.user).select_related(
            "exercise", "exercise__technique"
        )
