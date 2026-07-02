from django.contrib import admin

from .models import PracticeAttempt


@admin.register(PracticeAttempt)
class PracticeAttemptAdmin(admin.ModelAdmin):
    list_display = ("user", "exercise", "bpm_target", "accuracy", "score", "verified", "created_at")
    list_filter = ("verified", "exercise__technique")
