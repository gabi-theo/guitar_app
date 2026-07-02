from django.contrib import admin

from .models import Challenge


@admin.register(Challenge)
class ChallengeAdmin(admin.ModelAdmin):
    list_display = ("challenger", "opponent", "exercise", "bpm_target", "status", "winner", "created_at")
    list_filter = ("status",)
