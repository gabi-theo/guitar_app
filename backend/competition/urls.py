from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ChallengeViewSet, LeaderboardView

router = DefaultRouter()
router.register("challenges", ChallengeViewSet, basename="challenges")

urlpatterns = [
    path("leaderboard/", LeaderboardView.as_view(), name="leaderboard"),
    *router.urls,
]
