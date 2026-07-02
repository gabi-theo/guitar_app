import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../api/client";
import type { DailyChallenge } from "../types";

const KIND_LABEL: Record<string, string> = {
  consolidate: "Consolidate",
  push: "Push",
  explore: "Explore",
};

const KIND_ICON: Record<string, string> = {
  consolidate: "🎯",
  push: "🚀",
  explore: "🧭",
};

export default function DailyChallenges() {
  const [challenges, setChallenges] = useState<DailyChallenge[] | null>(null);

  useEffect(() => {
    api.get<DailyChallenge[]>("/goals/daily/").then(({ data }) => setChallenges(data));
  }, []);

  if (challenges === null) return <p className="muted">Loading today's challenges…</p>;
  if (challenges.length === 0)
    return <p className="muted">No challenges yet — the library is empty.</p>;

  const done = challenges.filter((c) => c.completed).length;

  return (
    <div>
      <p className="muted daily-progress-line">
        {done}/{challenges.length} completed today
      </p>
      <div className="daily-grid">
        {challenges.map((c) => (
          <div key={c.id} className={`daily-card${c.completed ? " done" : ""}`}>
            <div className="daily-card-top">
              <span className="chip">
                {KIND_ICON[c.kind]} {KIND_LABEL[c.kind]}
              </span>
              {c.completed ? (
                <span className="chip chip-win">✓ Done</span>
              ) : (
                <span className="muted">{Math.round(c.target_accuracy * 100)}%+ accuracy</span>
              )}
            </div>
            <p className="daily-title">{c.title}</p>
            <div className="daily-card-bottom">
              <span className="muted">
                {c.technique_name} · {c.bpm_target} BPM
              </span>
              {!c.completed && (
                <Link
                  className="button-link"
                  to={`/practice/${c.exercise}?bpm=${c.bpm_target}`}
                >
                  ▶ Play
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
