"""Recompute stored scores after removing the 85% pass threshold.

Attempts that scored 0 for falling below the old threshold now get their
real accuracy * bpm_achieved score, so history and leaderboards are
consistent with the new rule.
"""

from django.db import migrations


def recompute(apps, schema_editor):
    PracticeAttempt = apps.get_model("practice", "PracticeAttempt")
    for attempt in PracticeAttempt.objects.all().iterator():
        attempt.score = round(attempt.accuracy * attempt.bpm_achieved, 2)
        attempt.save(update_fields=["score"])


def restore_threshold(apps, schema_editor):
    PracticeAttempt = apps.get_model("practice", "PracticeAttempt")
    PracticeAttempt.objects.filter(accuracy__lt=0.85).update(score=0.0)


class Migration(migrations.Migration):
    dependencies = [
        ("practice", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(recompute, restore_threshold),
    ]
