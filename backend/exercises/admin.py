from django.contrib import admin

from .models import Exercise, Technique


@admin.register(Technique)
class TechniqueAdmin(admin.ModelAdmin):
    list_display = ("slug", "name")


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ("name", "technique", "difficulty", "is_active")
    list_filter = ("technique", "difficulty", "is_active")
