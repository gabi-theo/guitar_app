from rest_framework import permissions, viewsets

from .models import Exercise, Technique
from .serializers import (
    ExerciseDetailSerializer,
    ExerciseListSerializer,
    TechniqueSerializer,
)


class TechniqueViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Technique.objects.all()
    serializer_class = TechniqueSerializer
    pagination_class = None


class IsExerciseOwnerOrReadOnly(permissions.BasePermission):
    """Only the creator can modify a custom exercise; system exercises are read-only."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.created_by_id == request.user.id


class ExerciseViewSet(viewsets.ModelViewSet):
    """System exercises plus custom ones.

    List filters: ?technique=<slug>, ?source=system|mine|shared
    Authenticated users may create exercises (private or shared) and
    edit/delete only their own. Deleting deactivates so attempt history survives.
    """

    serializer_class = ExerciseListSerializer
    permission_classes = [permissions.IsAuthenticated, IsExerciseOwnerOrReadOnly]
    pagination_class = None

    def get_serializer_class(self):
        if self.action == "list":
            return ExerciseListSerializer
        return ExerciseDetailSerializer

    def get_queryset(self):
        user = self.request.user
        qs = (
            Exercise.objects.filter(is_active=True)
            .visible_to(user)
            .select_related("technique", "created_by")
        )
        params = self.request.query_params
        technique = params.get("technique")
        if technique:
            qs = qs.filter(technique__slug=technique)
        source = params.get("source")
        if source == "system":
            qs = qs.filter(created_by__isnull=True)
        elif source == "mine":
            qs = qs.filter(created_by=user)
        elif source == "shared":
            qs = qs.filter(visibility=Exercise.VISIBILITY_SHARED, created_by__isnull=False).exclude(
                created_by=user
            )
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        # soft delete: attempts/challenges keep their FK target
        instance.is_active = False
        instance.save(update_fields=["is_active"])
