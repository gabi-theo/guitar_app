import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from exercises.models import Exercise, Technique
from practice.models import PracticeAttempt
from practice.scoring import compute_accuracy, compute_score


class TestComputeAccuracy:
    def test_averages_components(self):
        assert compute_accuracy(0.9, 0.7) == pytest.approx(0.8)

    def test_perfect(self):
        assert compute_accuracy(1.0, 1.0) == 1.0

    def test_rejects_out_of_range(self):
        with pytest.raises(ValueError):
            compute_accuracy(1.1, 0.5)
        with pytest.raises(ValueError):
            compute_accuracy(0.5, -0.1)


class TestComputeScore:
    def test_score_is_accuracy_times_bpm(self):
        assert compute_score(0.9, 120) == pytest.approx(108.0)

    def test_low_accuracy_still_scores(self):
        # no pass threshold: every attempt earns accuracy * bpm
        assert compute_score(0.4, 100) == pytest.approx(40.0)

    def test_rejects_negative_bpm(self):
        with pytest.raises(ValueError):
            compute_score(0.9, -10)


@pytest.fixture
def api_user(db):
    user = get_user_model().objects.create_user(username="picker", password="x")
    client = APIClient()
    client.force_authenticate(user)
    return user, client


@pytest.fixture
def seeded_attempts(api_user):
    user, client = api_user
    alt = Technique.objects.create(slug="alternate_picking", name="Alternate Picking")
    leg = Technique.objects.create(slug="legato", name="Legato")
    pattern = [{"string": 1, "fret": 5, "duration": 0.25, "technique_marker": "pick"}]
    ex_alt = Exercise.objects.create(technique=alt, name="Chromatic", note_pattern=pattern, bpm_levels=[100, 120])
    ex_leg = Exercise.objects.create(technique=leg, name="Trill", note_pattern=pattern, bpm_levels=[100])
    a1 = PracticeAttempt.objects.create(
        user=user, exercise=ex_alt, bpm_target=100, timing_accuracy=0.9,
        pitch_accuracy=0.9, accuracy=0.9, bpm_achieved=100, score=90.0,
    )
    a2 = PracticeAttempt.objects.create(
        user=user, exercise=ex_alt, bpm_target=120, timing_accuracy=0.5,
        pitch_accuracy=0.5, accuracy=0.5, bpm_achieved=120, score=60.0,
    )
    a3 = PracticeAttempt.objects.create(
        user=user, exercise=ex_leg, bpm_target=100, timing_accuracy=1.0,
        pitch_accuracy=1.0, accuracy=1.0, bpm_achieved=100, score=100.0,
    )
    return client, (a1, a2, a3)


@pytest.mark.django_db
class TestAttemptListFilters:
    def test_filter_by_technique(self, seeded_attempts):
        client, (a1, a2, a3) = seeded_attempts
        data = client.get("/api/attempts/?technique=legato").json()
        assert [r["id"] for r in data["results"]] == [a3.id]

    def test_filter_by_bpm(self, seeded_attempts):
        client, (a1, a2, a3) = seeded_attempts
        data = client.get("/api/attempts/?bpm=120").json()
        assert [r["id"] for r in data["results"]] == [a2.id]

    def test_ordering_by_score(self, seeded_attempts):
        client, (a1, a2, a3) = seeded_attempts
        data = client.get("/api/attempts/?ordering=-score").json()
        assert [r["id"] for r in data["results"]] == [a3.id, a1.id, a2.id]

    def test_default_ordering_newest_first(self, seeded_attempts):
        client, (a1, a2, a3) = seeded_attempts
        data = client.get("/api/attempts/").json()
        assert [r["id"] for r in data["results"]] == [a3.id, a2.id, a1.id]

    def test_only_own_attempts_visible(self, seeded_attempts):
        client, _ = seeded_attempts
        other = get_user_model().objects.create_user(username="other", password="x")
        other_client = APIClient()
        other_client.force_authenticate(other)
        data = other_client.get("/api/attempts/").json()
        assert data["count"] == 0


@pytest.mark.django_db
class TestStatsEndpoints:
    def test_overview(self, seeded_attempts):
        client, (a1, a2, a3) = seeded_attempts
        data = client.get("/api/stats/overview/").json()
        assert data["total_attempts"] == 3
        assert data["practice_days"] == 1
        assert data["current_streak"] == 1
        assert data["best_score"] == 100.0
        assert data["best_score_exercise"] == "Trill"
        techniques = {t["slug"]: t for t in data["techniques"]}
        assert techniques["alternate_picking"]["attempts"] == 2
        # clean BPM = highest bpm_target with accuracy >= 0.8
        assert techniques["alternate_picking"]["best_clean_bpm"] == 100
        assert techniques["legato"]["best_clean_bpm"] == 100

    def test_overview_empty(self, api_user):
        _, client = api_user
        data = client.get("/api/stats/overview/").json()
        assert data["total_attempts"] == 0
        assert data["current_streak"] == 0
        assert data["best_score"] is None
        assert data["techniques"] == []

    def test_progress_series(self, seeded_attempts):
        client, _ = seeded_attempts
        data = client.get("/api/stats/progress/?days=30").json()
        assert data["days"] == 30
        assert len(data["series"]) == 1  # all attempts created today
        point = data["series"][0]
        assert point["attempts"] == 3
        assert point["best_score"] == 100.0
        assert point["max_bpm"] == 120

    def test_progress_technique_filter(self, seeded_attempts):
        client, _ = seeded_attempts
        data = client.get("/api/stats/progress/?days=30&technique=legato").json()
        assert data["series"][0]["attempts"] == 1

    def test_progress_clamps_bad_days_param(self, seeded_attempts):
        client, _ = seeded_attempts
        assert client.get("/api/stats/progress/?days=nope").json()["days"] == 90
        assert client.get("/api/stats/progress/?days=9999").json()["days"] == 365
