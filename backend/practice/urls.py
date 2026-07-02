from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import PracticeAttemptViewSet, StatsOverviewView, StatsProgressView

router = DefaultRouter()
router.register("attempts", PracticeAttemptViewSet, basename="attempts")

urlpatterns = [
    path("stats/overview/", StatsOverviewView.as_view(), name="stats-overview"),
    path("stats/progress/", StatsProgressView.as_view(), name="stats-progress"),
    *router.urls,
]
