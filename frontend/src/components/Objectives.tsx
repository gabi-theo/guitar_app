import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import api from "../api/client";
import type { Exercise, Objective } from "../types";

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function scheduleChip(o: Objective) {
  if (o.status === "achieved") return <span className="chip chip-win">🏆 Achieved</span>;
  if (o.days_adjustment < 0)
    return <span className="chip chip-win">{-o.days_adjustment}d ahead of plan</span>;
  if (o.days_adjustment > 0)
    return <span className="chip chip-loss">{o.days_adjustment}d behind plan</span>;
  return <span className="chip">on plan</span>;
}

export default function Objectives({ exercises }: { exercises: Exercise[] }) {
  const [objectives, setObjectives] = useState<Objective[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [exerciseId, setExerciseId] = useState("");
  const [bpm, setBpm] = useState("");
  const [accuracy, setAccuracy] = useState("0.8");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get<Objective[]>("/objectives/").then(({ data }) => setObjectives(data));
  }, []);

  useEffect(load, [load]);

  const exercise = useMemo(
    () => exercises.find((e) => String(e.id) === exerciseId),
    [exercises, exerciseId],
  );

  useEffect(() => {
    if (exercises.length > 0 && !exerciseId) {
      setExerciseId(String(exercises[0].id));
    }
  }, [exercises, exerciseId]);

  useEffect(() => {
    if (exercise) {
      const levels = exercise.bpm_levels;
      setBpm(String(levels[levels.length - 1] ?? ""));
    }
  }, [exercise]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/objectives/", {
        exercise: Number(exerciseId),
        target_bpm: Number(bpm),
        target_accuracy: Number(accuracy),
        target_date: date,
      });
      setShowForm(false);
      setDate("");
      load();
    } catch (err: any) {
      const data = err?.response?.data;
      setError(data ? Object.values(data).flat().join(" ") : "Could not create the objective.");
    }
  };

  const remove = async (id: number) => {
    await api.delete(`/objectives/${id}/`);
    load();
  };

  const active = (objectives ?? []).filter((o) => o.status === "active");
  const achieved = (objectives ?? []).filter((o) => o.status === "achieved");

  return (
    <div>
      <div className="controls">
        <button onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "＋ New objective"}
        </button>
        <span className="muted">
          Target dates adjust automatically to your measured progress rate.
        </span>
      </div>

      {showForm && (
        <form className="challenge-form" onSubmit={create}>
          <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
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
          <select value={accuracy} onChange={(e) => setAccuracy(e.target.value)}>
            {["0.7", "0.8", "0.9", "0.95"].map((a) => (
              <option key={a} value={a}>
                {Math.round(Number(a) * 100)}% accuracy
              </option>
            ))}
          </select>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Target date"
          />
          <button className="primary" type="submit">
            Set objective
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}

      {objectives === null ? (
        <p className="muted">Loading objectives…</p>
      ) : objectives.length === 0 ? (
        <p className="muted">
          No objectives yet — pick an exercise, a target BPM and a date, and ShredTrainer will
          track (and re-forecast) it as you practice.
        </p>
      ) : (
        <>
          {[...active, ...achieved].map((o) => (
            <div key={o.id} className="objective-card">
              <div className="objective-main">
                <strong>
                  <Link to={`/practice/${o.exercise}`}>{o.exercise_name}</Link> @ {o.target_bpm} BPM
                </strong>
                <span className="muted">
                  {o.technique_name} · {Math.round(o.target_accuracy * 100)}% accuracy target
                </span>
                <div className="objective-bar" role="progressbar" aria-valuenow={o.progress_percent}>
                  <div
                    className={`objective-fill${o.status === "achieved" ? " achieved" : ""}`}
                    style={{ width: `${o.progress_percent}%` }}
                  />
                </div>
                <span className="muted">
                  {o.progress_percent}% — best so far {Math.round(o.best_effective_bpm)} effective BPM
                </span>
              </div>
              <div className="objective-side">
                {scheduleChip(o)}
                <span className="muted">
                  target {fmtDate(o.target_date)}
                  {o.days_adjustment !== 0 && o.status === "active" && (
                    <> (was {fmtDate(o.initial_target_date)})</>
                  )}
                </span>
                <button onClick={() => remove(o.id)}>Remove</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
