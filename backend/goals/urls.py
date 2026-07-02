from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DailyChallengeView, ObjectiveViewSet

router = DefaultRouter()
router.register("objectives", ObjectiveViewSet, basename="objectives")

urlpatterns = [
    path("goals/daily/", DailyChallengeView.as_view(), name="daily-challenges"),
    *router.urls,
]
