import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from competition.models import Challenge
from exercises.models import Exercise, Technique
from practice.models import PracticeAttempt

User = get_user_model()

PATTERN = [{"string": 1, "fret": 5, "duration": 0.25, "technique_marker": "pick"}]


def make_attempt(user, exercise, bpm=100, score=90.0):
    return PracticeAttempt.objects.create(
        user=user, exercise=exercise, bpm_target=bpm, timing_accuracy=0.9,
        pitch_accuracy=0.9, accuracy=0.9, bpm_achieved=bpm, score=score,
    )


@pytest.fixture
def setup(db):
    tech = Technique.objects.create(slug="alternate_picking", name="Alternate Picking")
    exercise = Exercise.objects.create(
        technique=tech, name="Chromatic", note_pattern=PATTERN, bpm_levels=[100, 120]
    )
    alice = User.objects.create_user(username="alice", password="x")
    bob = User.objects.create_user(username="bob", password="x")
    carol = User.objects.create_user(username="carol", password="x")
    clients = {}
    for u in (alice, bob, carol):
        c = APIClient()
        c.force_authenticate(u)
        clients[u.username] = c
    return exercise, alice, bob, carol, clients


@pytest.mark.django_db
class TestLeaderboard:
    def test_best_attempt_per_user_ranked(self, setup):
        exercise, alice, bob, carol, clients = setup
        make_attempt(alice, exercise, score=90)
        make_attempt(alice, exercise, score=110)  # alice's best
        make_attempt(bob, exercise, score=120)
        make_attempt(carol, exercise, score=35)  # low accuracy still ranks — no threshold

        data = clients["alice"].get(f"/api/leaderboard/?exercise={exercise.id}").json()
        assert [(e["username"], e["score"], e["rank"]) for e in data] == [
            ("bob", 120.0, 1),
            ("alice", 110.0, 2),
            ("carol", 35.0, 3),
        ]

    def test_bpm_filter(self, setup):
        exercise, alice, bob, carol, clients = setup
        make_attempt(alice, exercise, bpm=100, score=90)
        make_attempt(alice, exercise, bpm=120, score=105)
        data = clients["alice"].get(f"/api/leaderboard/?exercise={exercise.id}&bpm=100").json()
        assert [e["score"] for e in data] == [90.0]

    def test_requires_exercise(self, setup):
        _, _, _, _, clients = setup
        assert clients["alice"].get("/api/leaderboard/").status_code == 400


@pytest.mark.django_db
class TestChallenges:
    def create_challenge(self, clients, exercise, opponent="bob", bpm=100):
        return clients["alice"].post(
            "/api/challenges/",
            {"opponent_username": opponent, "exercise": exercise.id, "bpm_target": bpm},
        )

    def test_create_and_visibility(self, setup):
        exercise, alice, bob, carol, clients = setup
        res = self.create_challenge(clients, exercise)
        assert res.status_code == 201
        assert len(clients["bob"].get("/api/challenges/").json()) == 1
        assert len(clients["carol"].get("/api/challenges/").json()) == 0

    def test_cannot_challenge_self(self, setup):
        exercise, _, _, _, clients = setup
        res = self.create_challenge(clients, exercise, opponent="alice")
        assert res.status_code == 400

    def test_invalid_bpm_rejected(self, setup):
        exercise, _, _, _, clients = setup
        assert self.create_challenge(clients, exercise, bpm=97).status_code == 400

    def test_full_flow_resolves_with_winner(self, setup):
        exercise, alice, bob, carol, clients = setup
        cid = self.create_challenge(clients, exercise).json()["id"]

        a_attempt = make_attempt(alice, exercise, score=95)
        res = clients["alice"].post(f"/api/challenges/{cid}/submit/", {"attempt": a_attempt.id})
        assert res.json()["status"] == "open"

        b_attempt = make_attempt(bob, exercise, score=105)
        res = clients["bob"].post(f"/api/challenges/{cid}/submit/", {"attempt": b_attempt.id})
        data = res.json()
        assert data["status"] == "complete"
        assert data["winner_name"] == "bob"
        assert data["challenger_score"] == 95.0
        assert data["opponent_score"] == 105.0

    def test_submit_must_match_exercise_and_bpm(self, setup):
        exercise, alice, bob, carol, clients = setup
        cid = self.create_challenge(clients, exercise).json()["id"]
        wrong_bpm = make_attempt(alice, exercise, bpm=120)
        res = clients["alice"].post(f"/api/challenges/{cid}/submit/", {"attempt": wrong_bpm.id})
        assert res.status_code == 400

    def test_cannot_submit_someone_elses_attempt(self, setup):
        exercise, alice, bob, carol, clients = setup
        cid = self.create_challenge(clients, exercise).json()["id"]
        bobs = make_attempt(bob, exercise)
        res = clients["alice"].post(f"/api/challenges/{cid}/submit/", {"attempt": bobs.id})
        assert res.status_code == 400

    def test_opponent_can_decline(self, setup):
        exercise, alice, bob, carol, clients = setup
        cid = self.create_challenge(clients, exercise).json()["id"]
        res = clients["bob"].post(f"/api/challenges/{cid}/decline/")
        assert res.json()["status"] == "declined"

    def test_challenger_cannot_decline(self, setup):
        exercise, alice, bob, carol, clients = setup
        cid = self.create_challenge(clients, exercise).json()["id"]
        assert clients["alice"].post(f"/api/challenges/{cid}/decline/").status_code == 403

    def test_draw_has_no_winner(self, setup):
        exercise, alice, bob, carol, clients = setup
        cid = self.create_challenge(clients, exercise).json()["id"]
        clients["alice"].post(f"/api/challenges/{cid}/submit/", {"attempt": make_attempt(alice, exercise, score=100).id})
        data = clients["bob"].post(f"/api/challenges/{cid}/submit/", {"attempt": make_attempt(bob, exercise, score=100).id}).json()
        assert data["status"] == "complete"
        assert data["winner_name"] is None
