from rest_framework.routers import DefaultRouter

from .views import ExerciseViewSet, TechniqueViewSet

router = DefaultRouter()
router.register("techniques", TechniqueViewSet)
router.register("exercises", ExerciseViewSet, basename="exercises")

urlpatterns = router.urls
