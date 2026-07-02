from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from exercises.models import Exercise, Technique
from practice.models import PracticeAttempt

from .models import DailyChallenge, Objective
from .services import best_clean_bpm, effective_bpm, ensure_daily_challenges

PATTERN = [{"string": 1, "fret": 5, "duration": 0.25, "technique_marker": "pick"}]


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(username="shredder", password="x")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def exercises(db):
    alt = Technique.objects.create(slug="alternate_picking", name="Alternate Picking")
    leg = Technique.objects.create(slug="legato", name="Legato")
    ex1 = Exercise.objects.create(
        technique=alt, name="Chromatic", difficulty=1, note_pattern=PATTERN, bpm_levels=[60, 80, 100]
    )
    ex2 = Exercise.objects.create(
        technique=leg, name="Trill", difficulty=1, note_pattern=PATTERN, bpm_levels=[60, 80]
    )
    return ex1, ex2


def attempt(user, exercise, bpm, accuracy, **kwargs):
    return PracticeAttempt.objects.create(
        user=user, exercise=exercise, bpm_target=bpm, timing_accuracy=accuracy,
        pitch_accuracy=accuracy, accuracy=accuracy, bpm_achieved=bpm,
        score=round(accuracy * bpm, 2), **kwargs,
    )


class TestServices:
    def test_effective_bpm_caps_at_target_accuracy(self):
        assert effective_bpm(100, 0.9, 0.8) == 100
        assert effective_bpm(100, 0.4, 0.8) == pytest.approx(50)

    @pytest.mark.django_db
    def test_best_clean_bpm(self, user, exercises):
        ex1, _ = exercises
        attempt(user, ex1, 60, 0.9)
        attempt(user, ex1, 80, 0.85)
        attempt(user, ex1, 100, 0.5)
        assert best_clean_bpm(user, ex1) == 80


@pytest.mark.django_db
class TestDailyChallenges:
    def test_generated_once_per_day(self, user, exercises):
        first = ensure_daily_challenges(user)
        second = ensure_daily_challenges(user)
        assert len(first) == 3
        assert [c.id for c in first] == [c.id for c in second]

    def test_new_user_gets_starter_challenges(self, user, exercises):
        challenges = ensure_daily_challenges(user)
        by_kind = {c.kind: c for c in challenges}
        assert set(by_kind) == {"consolidate", "push", "explore"}
        # no history: consolidate/explore start at the lowest BPM level,
        # push targets the next level up
        assert by_kind["consolidate"].bpm_target == by_kind["consolidate"].exercise.bpm_levels[0]
        assert by_kind["explore"].bpm_target == by_kind["explore"].exercise.bpm_levels[0]
        assert by_kind["push"].bpm_target == by_kind["push"].exercise.bpm_levels[1]

    def test_push_targets_next_level_after_clean_attempts(self, user, exercises):
        ex1, _ = exercises
        attempt(user, ex1, 60, 0.9)
        challenges = ensure_daily_challenges(user)
        push = next(c for c in challenges if c.kind == "push")
        assert push.exercise_id == ex1.id
        assert push.bpm_target == 80

    def test_explore_prefers_unpracticed_technique(self, user, exercises):
        ex1, ex2 = exercises
        attempt(user, ex1, 60, 0.9)
        challenges = ensure_daily_challenges(user)
        explore = next(c for c in challenges if c.kind == "explore")
        assert explore.exercise_id == ex2.id

    def test_attempt_completes_matching_challenge(self, user, client, exercises):
        ex1, _ = exercises
        challenges = ensure_daily_challenges(user)
        target = next(c for c in challenges if c.kind == "consolidate")
        attempt(user, target.exercise, target.bpm_target, target.target_accuracy + 0.05)
        target.refresh_from_db()
        assert target.completed

    def test_low_accuracy_attempt_does_not_complete(self, user, exercises):
        ex1, _ = exercises
        challenges = ensure_daily_challenges(user)
        target = next(c for c in challenges if c.kind == "consolidate")
        attempt(user, target.exercise, target.bpm_target, max(0.0, target.target_accuracy - 0.2))
        target.refresh_from_db()
        assert not target.completed

    def test_daily_endpoint(self, client):
        # no exercises seeded → empty list, not an error
        res = client.get("/api/goals/daily/")
        assert res.status_code == 200
        assert res.json() == []


@pytest.mark.django_db
class TestObjectives:
    def make_objective(self, client, exercise, bpm=100, days=30, accuracy=0.8):
        return client.post("/api/objectives/", {
            "exercise": exercise.id,
            "target_bpm": bpm,
            "target_accuracy": accuracy,
            "target_date": (timezone.localdate() + timedelta(days=days)).isoformat(),
        }, format="json")

    def test_create_records_baseline(self, user, client, exercises):
        ex1, _ = exercises
        attempt(user, ex1, 60, 0.8)
        res = self.make_objective(client, ex1)
        assert res.status_code == 201, res.json()
        data = res.json()
        assert data["start_effective_bpm"] == pytest.approx(60)
        assert data["initial_target_date"] == data["target_date"]
        assert data["status"] == "active"

    def test_rejects_invalid_bpm_level(self, client, exercises):
        ex1, _ = exercises
        res = self.make_objective(client, ex1, bpm=75)
        assert res.status_code == 400

    def test_rejects_past_target_date(self, client, exercises):
        ex1, _ = exercises
        res = self.make_objective(client, ex1, days=-1)
        assert res.status_code == 400

    def test_qualifying_attempt_achieves_objective(self, user, client, exercises):
        ex1, _ = exercises
        res = self.make_objective(client, ex1, bpm=80)
        objective_id = res.json()["id"]
        attempt(user, ex1, 80, 0.85)
        obj = Objective.objects.get(pk=objective_id)
        assert obj.status == Objective.STATUS_ACHIEVED
        assert obj.achieved_at is not None

    def test_target_date_moves_earlier_with_fast_progress(self, user, client, exercises):
        ex1, _ = exercises
        attempt(user, ex1, 60, 0.8)
        res = self.make_objective(client, ex1, bpm=100, days=60)
        obj = Objective.objects.get(pk=res.json()["id"])
        # simulate: objective created a while ago, then big progress
        obj.created_at = timezone.now() - timedelta(days=10)
        obj.save(update_fields=["created_at"])
        attempt(user, ex1, 80, 0.85)  # effective 80, gained 20 in 10 days
        obj.refresh_from_db()
        assert obj.status == Objective.STATUS_ACTIVE
        # remaining 20 bpm at 2/day → ~10 days out, far sooner than 60
        assert obj.target_date < obj.initial_target_date
        assert obj.target_date <= timezone.localdate() + timedelta(days=11)

    def test_only_own_objectives_listed(self, user, client, exercises):
        ex1, _ = exercises
        self.make_objective(client, ex1)
        other = get_user_model().objects.create_user(username="other", password="x")
        other_client = APIClient()
        other_client.force_authenticate(other)
        assert other_client.get("/api/objectives/").json() == []
