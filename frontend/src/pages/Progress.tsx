import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import api from "../api/client";
import DailyChallenges from "../components/DailyChallenges";
import Objectives from "../components/Objectives";
import TrendChart, { type TrendPoint } from "../components/TrendChart";
import type { Exercise, ProgressSeries, StatsOverview, Technique } from "../types";

type Metric = "best_score" | "avg_accuracy" | "max_bpm";

const METRICS: { key: Metric; label: string; format: (v: number) => string }[] = [
  { key: "best_score", label: "Best score", format: (v) => v.toFixed(0) },
  { key: "avg_accuracy", label: "Accuracy", format: (v) => `${Math.round(v * 100)}%` },
  { key: "max_bpm", label: "Top BPM", format: (v) => v.toFixed(0) },
];

const RANGES = [
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1y" },
];

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="muted stat-hint">{hint}</span>}
    </div>
  );
}

export default function Progress() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [progress, setProgress] = useState<ProgressSeries | null>(null);
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  const [metric, setMetric] = useState<Metric>("best_score");
  const [days, setDays] = useState(90);
  const [technique, setTechnique] = useState("");

  useEffect(() => {
    api.get<StatsOverview>("/stats/overview/").then(({ data }) => setOverview(data));
    api.get<Technique[]>("/techniques/").then(({ data }) => setTechniques(data));
    api.get<Exercise[]>("/exercises/").then(({ data }) => setExercises(data));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (technique) params.set("technique", technique);
    api
      .get<ProgressSeries>(`/stats/progress/?${params}`)
      .then(({ data }) => setProgress(data));
  }, [days, technique]);

  const metricDef = METRICS.find((m) => m.key === metric)!;

  const points: TrendPoint[] = useMemo(
    () =>
      (progress?.series ?? []).map((p) => ({
        date: p.date,
        value: p[metric],
        detail: `${p.attempts} attempt${p.attempts === 1 ? "" : "s"}`,
      })),
    [progress, metric],
  );

  return (
    <div>
      <div className="page-head">
        <h2>Dashboard</h2>
        <p className="muted">Your evolution, today's challenges, and long-term objectives.</p>
      </div>

      {overview && (
        <div className="stat-row">
          <StatTile
            label="Day streak"
            value={String(overview.current_streak)}
            hint={overview.current_streak > 0 ? "🔥 keep it alive" : "play today to start one"}
          />
          <StatTile
            label="Attempts (30 days)"
            value={String(overview.attempts_30d)}
            hint={`${overview.total_attempts} all-time`}
          />
          <StatTile
            label="Avg accuracy (30 days)"
            value={
              overview.avg_accuracy_30d !== null
                ? `${Math.round(overview.avg_accuracy_30d * 100)}%`
                : "—"
            }
          />
          <StatTile
            label="Best score"
            value={overview.best_score !== null ? overview.best_score.toFixed(1) : "—"}
            hint={overview.best_score_exercise ?? undefined}
          />
        </div>
      )}

      <h3>Today's challenges</h3>
      <DailyChallenges />

      <h3>Evolution</h3>
      <div className="controls">
        <span className="seg-group" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              className={days === r.days ? "seg active" : "seg"}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </span>
        <span className="seg-group" role="group" aria-label="Metric">
          {METRICS.map((m) => (
            <button
              key={m.key}
              className={metric === m.key ? "seg active" : "seg"}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </span>
        <label>
          Technique:{" "}
          <select value={technique} onChange={(e) => setTechnique(e.target.value)}>
            <option value="">All</option>
            {techniques.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="chart-card">
        <p className="muted chart-title">
          {metricDef.label} per day{technique ? ` — ${techniques.find((t) => t.slug === technique)?.name}` : ""}
        </p>
        {progress === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <TrendChart points={points} formatValue={metricDef.format} />
        )}
      </div>

      {overview && overview.techniques.length > 0 && (
        <>
          <h3>By technique</h3>
          <table className="history">
            <thead>
              <tr>
                <th>Technique</th>
                <th>Attempts</th>
                <th>Best score</th>
                <th>Avg accuracy</th>
                <th>Clean BPM (80%+)</th>
                <th>Last practiced</th>
              </tr>
            </thead>
            <tbody>
              {overview.techniques.map((t) => (
                <tr key={t.slug}>
                  <td>{t.name}</td>
                  <td>{t.attempts}</td>
                  <td className="score-pass">{t.best_score.toFixed(1)}</td>
                  <td>{Math.round(t.avg_accuracy * 100)}%</td>
                  <td>{t.best_clean_bpm ?? "—"}</td>
                  <td className="muted">{new Date(t.last_practiced).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {overview && overview.total_attempts === 0 && (
        <p className="empty-state">
          Nothing to chart yet — play something from the <Link to="/">exercise library</Link> and
          your evolution will show up here.
        </p>
      )}

      <h3>Objectives</h3>
      <Objectives exercises={exercises} />
    </div>
  );
}
