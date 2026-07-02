import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../api/client";
import type { Exercise, Technique } from "../types";

const DIFFICULTY = ["", "Beginner", "Intermediate", "Advanced", "Expert"];

const TECHNIQUE_ICON: Record<string, string> = {
  alternate_picking: "⚡",
  sweep_picking: "🌊",
  legato: "〰",
  tapping: "👆",
};

type Source = "" | "system" | "mine" | "shared";

const SOURCES: { value: Source; label: string }[] = [
  { value: "", label: "All" },
  { value: "system", label: "Built-in" },
  { value: "mine", label: "Mine" },
  { value: "shared", label: "Community" },
];

function ExerciseCard({ e }: { e: Exercise }) {
  return (
    <div className="exercise-card-wrap">
      <Link to={`/practice/${e.id}`} className="exercise-card">
        <div className="exercise-card-top">
          <strong>{e.name}</strong>
          <span className={`chip diff-${e.difficulty}`}>{DIFFICULTY[e.difficulty]}</span>
        </div>
        <p className="muted">{e.description}</p>
        <span className="muted bpm-range">
          {e.bpm_levels[0]}–{e.bpm_levels[e.bpm_levels.length - 1]} BPM
        </span>
        {e.is_custom && (
          <span className="card-badges">
            {e.is_owner ? (
              <span className="chip">{e.visibility === "shared" ? "🌍 shared by you" : "🔒 private"}</span>
            ) : (
              <span className="chip">🌍 by {e.owner_name}</span>
            )}
          </span>
        )}
      </Link>
      {e.is_owner && (
        <Link className="card-edit" to={`/exercises/${e.id}/edit`}>
          ✎ Edit
        </Link>
      )}
    </div>
  );
}

export default function ExerciseLibrary() {
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [source, setSource] = useState<Source>("");

  useEffect(() => {
    api.get<Technique[]>("/techniques/").then(({ data }) => setTechniques(data));
  }, []);

  useEffect(() => {
    const params = source ? `?source=${source}` : "";
    api.get<Exercise[]>(`/exercises/${params}`).then(({ data }) => setExercises(data));
  }, [source]);

  return (
    <div>
      <div className="page-head">
        <h2>Exercise library</h2>
        <p className="muted">Pick a lick, hear it, loop the hard part, then play it for a score.</p>
      </div>

      <div className="controls">
        <span className="seg-group" role="group" aria-label="Source">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              className={source === s.value ? "seg active" : "seg"}
              onClick={() => setSource(s.value)}
            >
              {s.label}
            </button>
          ))}
        </span>
        <Link className="button-link primary" to="/exercises/new">
          ＋ Create exercise
        </Link>
      </div>

      {techniques.map((t) => {
        const list = exercises.filter((e) => e.technique.id === t.id);
        if (list.length === 0) return null;
        return (
          <section key={t.id} className="technique-section">
            <h3>
              <span className="technique-icon">{TECHNIQUE_ICON[t.slug] ?? "🎵"}</span> {t.name}
            </h3>
            <p className="muted">{t.description}</p>
            <div className="card-grid">
              {list.map((e) => (
                <ExerciseCard key={e.id} e={e} />
              ))}
            </div>
          </section>
        );
      })}
      {exercises.length === 0 && (
        <p className="empty-state">
          Nothing here yet.{" "}
          {source === "mine" ? (
            <>
              <Link to="/exercises/new">Create your first exercise</Link> — private or shared.
            </>
          ) : (
            "Try a different filter."
          )}
        </p>
      )}
    </div>
  );
}
