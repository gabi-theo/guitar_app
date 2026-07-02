from django.contrib import admin

from .models import DailyChallenge, Objective


@admin.register(DailyChallenge)
class DailyChallengeAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "kind", "exercise", "bpm_target", "target_accuracy", "completed")
    list_filter = ("date", "kind", "completed")


@admin.register(Objective)
class ObjectiveAdmin(admin.ModelAdmin):
    list_display = ("user", "exercise", "target_bpm", "target_accuracy", "target_date", "status")
    list_filter = ("status",)
