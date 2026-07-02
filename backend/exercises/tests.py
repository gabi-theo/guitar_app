import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APIClient

from exercises.models import Exercise, Technique

VALID_MARKERS = {"pick", "hammer", "pull", "tap", "slide"}

PATTERN = [{"string": 1, "fret": 5, "duration": 0.25, "technique_marker": "pick"}]


@pytest.mark.django_db
class TestSeedExercises:
    def test_seed_creates_phase1_library(self):
        call_command("seed_exercises")
        assert set(Technique.objects.values_list("slug", flat=True)) == {
            "alternate_picking", "legato", "tapping", "sweep_picking",
        }
        for technique in Technique.objects.all():
            assert technique.exercises.count() >= 7

    def test_note_patterns_are_valid(self):
        call_command("seed_exercises")
        for exercise in Exercise.objects.all():
            assert exercise.bpm_levels, exercise.name
            assert exercise.note_pattern, exercise.name
            for n in exercise.note_pattern:
                assert 1 <= n["string"] <= 6, exercise.name
                assert 0 <= n["fret"] <= 24, exercise.name
                assert n["duration"] > 0, exercise.name
                assert n["technique_marker"] in VALID_MARKERS, exercise.name

    def test_seed_is_idempotent(self):
        call_command("seed_exercises")
        count = Exercise.objects.count()
        call_command("seed_exercises")
        assert Exercise.objects.count() == count


@pytest.fixture
def technique(db):
    return Technique.objects.create(slug="legato", name="Legato")


@pytest.fixture
def clients(db):
    User = get_user_model()
    User.objects.create_user(username="alice", password="x")
    User.objects.create_user(username="bob", password="x")
    a, b = APIClient(), APIClient()
    a.force_authenticate(User.objects.get(username="alice"))
    b.force_authenticate(User.objects.get(username="bob"))
    return a, b


def payload(technique, **overrides):
    data = {
        "technique_id": technique.id,
        "name": "My lick",
        "description": "custom",
        "difficulty": 2,
        "note_pattern": PATTERN,
        "bpm_levels": [60, 80],
        "visibility": "private",
    }
    data.update(overrides)
    return data


@pytest.mark.django_db
class TestCustomExercises:
    def test_create_sets_owner(self, clients, technique):
        a, _ = clients
        res = a.post("/api/exercises/", payload(technique), format="json")
        assert res.status_code == 201, res.json()
        data = res.json()
        assert data["is_custom"] and data["is_owner"]
        assert Exercise.objects.get(pk=data["id"]).created_by.username == "alice"

    def test_private_exercise_hidden_from_others(self, clients, technique):
        a, b = clients
        ex_id = a.post("/api/exercises/", payload(technique), format="json").json()["id"]
        assert b.get(f"/api/exercises/{ex_id}/").status_code == 404
        assert all(e["id"] != ex_id for e in b.get("/api/exercises/").json())

    def test_shared_exercise_visible_readonly_to_others(self, clients, technique):
        a, b = clients
        ex_id = a.post("/api/exercises/", payload(technique, visibility="shared"), format="json").json()["id"]
        detail = b.get(f"/api/exercises/{ex_id}/")
        assert detail.status_code == 200
        assert detail.json()["owner_name"] == "alice"
        assert not detail.json()["is_owner"]
        assert b.patch(f"/api/exercises/{ex_id}/", {"name": "hijacked"}, format="json").status_code == 403
        assert b.delete(f"/api/exercises/{ex_id}/").status_code == 403

    def test_owner_can_update_and_soft_delete(self, clients, technique):
        a, _ = clients
        ex_id = a.post("/api/exercises/", payload(technique), format="json").json()["id"]
        assert a.patch(f"/api/exercises/{ex_id}/", {"visibility": "shared"}, format="json").status_code == 200
        assert a.delete(f"/api/exercises/{ex_id}/").status_code == 204
        ex = Exercise.objects.get(pk=ex_id)
        assert not ex.is_active  # soft-deleted so attempts keep their FK

    def test_system_exercise_not_editable(self, clients, technique):
        a, _ = clients
        system = Exercise.objects.create(
            technique=technique, name="Seeded", note_pattern=PATTERN, bpm_levels=[60]
        )
        assert a.patch(f"/api/exercises/{system.id}/", {"name": "nope"}, format="json").status_code == 403

    def test_source_filter(self, clients, technique):
        a, b = clients
        a.post("/api/exercises/", payload(technique, name="mine"), format="json")
        b.post("/api/exercises/", payload(technique, name="theirs", visibility="shared"), format="json")
        Exercise.objects.create(technique=technique, name="system", note_pattern=PATTERN, bpm_levels=[60])
        names = lambda res: {e["name"] for e in res.json()}  # noqa: E731
        assert names(a.get("/api/exercises/?source=mine")) == {"mine"}
        assert names(a.get("/api/exercises/?source=shared")) == {"theirs"}
        assert names(a.get("/api/exercises/?source=system")) == {"system"}
        assert names(a.get("/api/exercises/")) == {"mine", "theirs", "system"}

    @pytest.mark.parametrize("bad_pattern", [
        [],
        [{"string": 7, "fret": 5, "duration": 0.25, "technique_marker": "pick"}],
        [{"string": 1, "fret": 25, "duration": 0.25, "technique_marker": "pick"}],
        [{"string": 1, "fret": 5, "duration": 0, "technique_marker": "pick"}],
        [{"string": 1, "fret": 5, "duration": 0.25, "technique_marker": "bend"}],
    ])
    def test_rejects_invalid_note_pattern(self, clients, technique, bad_pattern):
        a, _ = clients
        res = a.post("/api/exercises/", payload(technique, note_pattern=bad_pattern), format="json")
        assert res.status_code == 400

    @pytest.mark.parametrize("bad_levels", [[], [20], [400], [100, 80], [80, 80]])
    def test_rejects_invalid_bpm_levels(self, clients, technique, bad_levels):
        a, _ = clients
        res = a.post("/api/exercises/", payload(technique, bpm_levels=bad_levels), format="json")
        assert res.status_code == 400
