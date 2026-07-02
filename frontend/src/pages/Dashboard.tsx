import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import api from "../api/client";
import type { Exercise, Paginated, PracticeAttempt, Technique } from "../types";

type SortField = "created_at" | "score" | "accuracy" | "bpm_target" | "timing_accuracy" | "pitch_accuracy";

interface Sort {
  field: SortField;
  dir: "asc" | "desc";
}

const COLUMNS: { field: SortField; label: string }[] = [
  { field: "created_at", label: "When" },
  { field: "bpm_target", label: "BPM" },
  { field: "timing_accuracy", label: "Timing" },
  { field: "pitch_accuracy", label: "Pitch" },
  { field: "accuracy", label: "Accuracy" },
  { field: "score", label: "Score" },
];

export default function Dashboard() {
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [attempts, setAttempts] = useState<PracticeAttempt[]>([]);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);

  const [technique, setTechnique] = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const [sort, setSort] = useState<Sort>({ field: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get<Technique[]>("/techniques/").then(({ data }) => setTechniques(data));
    api.get<Exercise[]>("/exercises/").then(({ data }) => setExercises(data));
  }, []);

  const exerciseOptions = useMemo(
    () => (technique ? exercises.filter((e) => e.technique.slug === technique) : exercises),
    [exercises, technique],
  );

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("ordering", `${sort.dir === "desc" ? "-" : ""}${sort.field}`);
    params.set("page", String(page));
    if (technique) params.set("technique", technique);
    if (exerciseId) params.set("exercise", exerciseId);

    setLoading(true);
    api
      .get<Paginated<PracticeAttempt>>(`/attempts/?${params}`)
      .then(({ data }) => {
        setAttempts(data.results);
        setCount(data.count);
        setHasNext(data.next !== null);
      })
      .finally(() => setLoading(false));
  }, [technique, exerciseId, sort, page]);

  const toggleSort = (field: SortField) => {
    setPage(1);
    setSort((s) =>
      s.field === field
        ? { field, dir: s.dir === "desc" ? "asc" : "desc" }
        : { field, dir: "desc" },
    );
  };

  const arrow = (field: SortField) =>
    sort.field === field ? (sort.dir === "desc" ? " ▾" : " ▴") : "";

  return (
    <div>
      <h2>Practice history</h2>

      <div className="controls">
        <label>
          Technique:{" "}
          <select
            value={technique}
            onChange={(e) => {
              setTechnique(e.target.value);
              setExerciseId("");
              setPage(1);
            }}
          >
            <option value="">All</option>
            {techniques.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Exercise:{" "}
          <select
            value={exerciseId}
            onChange={(e) => {
              setExerciseId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {exerciseOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          {count} attempt{count === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : attempts.length === 0 ? (
        <p className="muted">
          No attempts match — practice something from the <Link to="/">exercise library</Link>.
        </p>
      ) : (
        <>
          <table className="history">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("created_at")}>
                  When{arrow("created_at")}
                </th>
                <th>Exercise</th>
                {COLUMNS.slice(1).map((c) => (
                  <th key={c.field} className="sortable" onClick={() => toggleSort(c.field)}>
                    {c.label}
                    {arrow(c.field)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td>
                    <Link to={`/practice/${a.exercise}`}>{a.exercise_name}</Link>
                  </td>
                  <td>{a.bpm_target}</td>
                  <td>{(a.timing_accuracy * 100).toFixed(0)}%</td>
                  <td>{(a.pitch_accuracy * 100).toFixed(0)}%</td>
                  <td>{(a.accuracy * 100).toFixed(0)}%</td>
                  <td className="score-pass">{a.score.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="controls">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <span className="muted">Page {page}</span>
            <button disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
