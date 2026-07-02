import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import api from "../api/client";
import { useAuth } from "../store/auth";
import type { Challenge, Exercise } from "../types";

export default function Challenges() {
  const me = useAuth((s) => s.user);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  // create form
  const [opponent, setOpponent] = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const [bpm, setBpm] = useState("");
  const [formError, setFormError] = useState("");
  const [formOk, setFormOk] = useState("");

  const load = useCallback(() => {
    api
      .get<Challenge[]>("/challenges/")
      .then(({ data }) => setChallenges(data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    api.get<Exercise[]>("/exercises/").then(({ data }) => {
      setExercises(data);
      if (data.length > 0) {
        setExerciseId(String(data[0].id));
        setBpm(String(data[0].bpm_levels[0]));
      }
    });
  }, [load]);

  const exercise = useMemo(
    () => exercises.find((e) => String(e.id) === exerciseId),
    [exercises, exerciseId],
  );

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormOk("");
    try {
      await api.post("/challenges/", {
        opponent_username: opponent,
        exercise: Number(exerciseId),
        bpm_target: Number(bpm),
      });
      setFormOk(`Challenge sent to ${opponent}!`);
      setOpponent("");
      load();
    } catch (err: any) {
      const data = err?.response?.data;
      setFormError(data ? Object.values(data).flat().join(" ") : "Could not create challenge.");
    }
  };

  const decline = async (id: number) => {
    await api.post(`/challenges/${id}/decline/`);
    load();
  };

  const iAmChallenger = (c: Challenge) => c.challenger_name === me?.username;
  const myScore = (c: Challenge) => (iAmChallenger(c) ? c.challenger_score : c.opponent_score);
  const theirScore = (c: Challenge) => (iAmChallenger(c) ? c.opponent_score : c.challenger_score);
  const opponentName = (c: Challenge) => (iAmChallenger(c) ? c.opponent_name : c.challenger_name);

  const open = challenges.filter((c) => c.status === "open");
  const finished = challenges.filter((c) => c.status !== "open");

  const renderRow = (c: Challenge) => {
    const mine = myScore(c);
    const theirs = theirScore(c);
    const won = c.status === "complete" && c.winner_name === me?.username;
    const draw = c.status === "complete" && c.winner_name === null;
    return (
      <div key={c.id} className="challenge-card">
        <div className="challenge-main">
          <strong>vs {opponentName(c)}</strong>
          <span>
            {c.exercise_name} @ {c.bpm_target} BPM
          </span>
          <span className="muted">{new Date(c.created_at).toLocaleDateString()}</span>
        </div>
        <div className="challenge-scores">
          <span>
            You: <strong>{mine !== null ? mine.toFixed(1) : "—"}</strong>
          </span>
          <span>
            Them: <strong>{theirs !== null ? theirs.toFixed(1) : "—"}</strong>
          </span>
        </div>
        <div className="challenge-actions">
          {c.status === "open" && mine === null && (
            <Link className="button-link primary" to={`/practice/${c.exercise}?challenge=${c.id}&bpm=${c.bpm_target}`}>
              ▶ Play your attempt
            </Link>
          )}
          {c.status === "open" && mine !== null && <span className="chip">waiting for {opponentName(c)}</span>}
          {c.status === "open" && !iAmChallenger(c) && mine === null && (
            <button onClick={() => decline(c.id)}>Decline</button>
          )}
          {c.status === "complete" && (
            <span className={`chip ${won ? "chip-win" : draw ? "" : "chip-loss"}`}>
              {won ? "🏆 You won" : draw ? "Draw" : `${c.winner_name} won`}
            </span>
          )}
          {c.status === "declined" && <span className="chip">declined</span>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-head">
        <h2>Challenges</h2>
        <p className="muted">
          Challenge another player: same exercise, same BPM, best score wins. Play whenever you like —
          it resolves once both attempts are in.
        </p>
      </div>

      <form className="challenge-form" onSubmit={create}>
        <input
          placeholder="Opponent username"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          required
        />
        <select
          value={exerciseId}
          onChange={(e) => {
            setExerciseId(e.target.value);
            const ex = exercises.find((x) => String(x.id) === e.target.value);
            if (ex) setBpm(String(ex.bpm_levels[0]));
          }}
        >
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.technique.name} — {e.name}
            </option>
          ))}
        </select>
        <select value={bpm} onChange={(e) => setBpm(e.target.value)}>
          {exercise?.bpm_levels.map((b) => (
            <option key={b} value={b}>
              {b} BPM
            </option>
          ))}
        </select>
        <button className="primary" type="submit">
          ⚔ Send challenge
        </button>
      </form>
      {formError && <p className="error">{formError}</p>}
      {formOk && <p className="success">{formOk}</p>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <h3>Open ({open.length})</h3>
          {open.length === 0 ? <p className="muted">No open challenges.</p> : open.map(renderRow)}
          <h3>Finished ({finished.length})</h3>
          {finished.length === 0 ? <p className="muted">Nothing here yet.</p> : finished.map(renderRow)}
        </>
      )}
    </div>
  );
}
