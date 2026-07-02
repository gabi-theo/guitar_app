import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import api from "../api/client";
import { useAuth } from "../store/auth";
import type { Exercise, LeaderboardEntry } from "../types";

export default function Leaderboard() {
  const me = useAuth((s) => s.user);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseId, setExerciseId] = useState<string>("");
  const [bpm, setBpm] = useState<string>("");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<Exercise[]>("/exercises/").then(({ data }) => {
      setExercises(data);
      if (data.length > 0) setExerciseId(String(data[0].id));
    });
  }, []);

  const exercise = useMemo(
    () => exercises.find((e) => String(e.id) === exerciseId),
    [exercises, exerciseId],
  );

  useEffect(() => {
    if (!exerciseId) return;
    const params = new URLSearchParams({ exercise: exerciseId });
    if (bpm) params.set("bpm", bpm);
    setLoading(true);
    api
      .get<LeaderboardEntry[]>(`/leaderboard/?${params}`)
      .then(({ data }) => setEntries(data))
      .finally(() => setLoading(false));
  }, [exerciseId, bpm]);

  return (
    <div>
      <div className="page-head">
        <h2>Leaderboard</h2>
        <p className="muted">Each player's best attempt, ranked by score (accuracy × BPM).</p>
      </div>

      <div className="controls">
        <label>
          Exercise:{" "}
          <select
            value={exerciseId}
            onChange={(e) => {
              setExerciseId(e.target.value);
              setBpm("");
            }}
          >
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.technique.name} — {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          BPM:{" "}
          <select value={bpm} onChange={(e) => setBpm(e.target.value)}>
            <option value="">All levels</option>
            {exercise?.bpm_levels.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <p>No attempts on this exercise yet.</p>
          {exercise && (
            <Link className="button-link" to={`/practice/${exercise.id}`}>
              Be the first →
            </Link>
          )}
        </div>
      ) : (
        <table className="history">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>BPM</th>
              <th>Accuracy</th>
              <th>Score</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.user_id} className={me?.id === e.user_id ? "row-me" : ""}>
                <td>
                  {e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : e.rank}
                </td>
                <td>
                  {e.display_name || e.username}
                  {me?.id === e.user_id && <span className="chip">you</span>}
                </td>
                <td>{e.bpm_target}</td>
                <td>{(e.accuracy * 100).toFixed(0)}%</td>
                <td className="score-pass">{e.score.toFixed(1)}</td>
                <td className="muted">{new Date(e.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
