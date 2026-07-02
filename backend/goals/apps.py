from django.apps import AppConfig


class GoalsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "goals"

    def ready(self):
        from . import signals  # noqa: F401 — connect attempt→goal signal handlers
