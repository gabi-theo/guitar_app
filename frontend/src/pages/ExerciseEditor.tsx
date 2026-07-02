import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import api from "../api/client";
import { stringFretToMidi } from "../audio/noteMapping";
import { timeNotes } from "../audio/transport";
import TabRenderer from "../components/TabRenderer/TabRenderer";
import type { Exercise, ExerciseVisibility, PatternNote, Technique, TechniqueMarker } from "../types";

const MARKERS: TechniqueMarker[] = ["pick", "hammer", "pull", "tap", "slide"];
const DURATIONS = [
  { value: 0.25, label: "1/16" },
  { value: 1 / 3, label: "triplet" },
  { value: 0.5, label: "1/8" },
  { value: 1, label: "1/4" },
];
const DIFFICULTY = ["", "Beginner", "Intermediate", "Advanced", "Expert"];

const defaultNote = (): PatternNote => ({
  string: 1,
  fret: 5,
  duration: 0.25,
  technique_marker: "pick",
});

/** Seeded patterns store triplets rounded (0.3333); snap to the editor's exact options. */
const snapDuration = (d: number): number => {
  const match = DURATIONS.find((opt) => Math.abs(opt.value - d) < 0.01);
  return match ? match.value : d;
};

export default function ExerciseEditor() {
  const { id } = useParams(); // undefined = create
  const navigate = useNavigate();
  const editing = id !== undefined;

  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [techniqueId, setTechniqueId] = useState("");
  const [difficulty, setDifficulty] = useState(1);
  const [bpmLevels, setBpmLevels] = useState("60, 80, 100, 120");
  const [visibility, setVisibility] = useState<ExerciseVisibility>("private");
  const [pattern, setPattern] = useState<PatternNote[]>([defaultNote()]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.get<Technique[]>("/techniques/").then(({ data }) => {
      setTechniques(data);
      if (data.length > 0) setTechniqueId((cur) => cur || String(data[0].id));
    });
  }, []);

  useEffect(() => {
    if (!editing) return;
    api
      .get<Exercise>(`/exercises/${id}/`)
      .then(({ data }) => {
        if (!data.is_owner) {
          setNotFound(true);
          return;
        }
        setName(data.name);
        setDescription(data.description);
        setTechniqueId(String(data.technique.id));
        setDifficulty(data.difficulty);
        setBpmLevels(data.bpm_levels.join(", "));
        setVisibility(data.visibility);
        setPattern(
          (data.note_pattern ?? [defaultNote()]).map((n) => ({
            ...n,
            duration: snapDuration(n.duration),
          })),
        );
      })
      .catch(() => setNotFound(true));
  }, [editing, id]);

  const timed = useMemo(
    () => (pattern.length > 0 ? timeNotes(pattern, stringFretToMidi) : null),
    [pattern],
  );

  const updateNote = (index: number, patch: Partial<PatternNote>) => {
    setPattern((p) => p.map((n, i) => (i === index ? { ...n, ...patch } : n)));
  };

  const addNote = () => {
    setPattern((p) => {
      const last = p[p.length - 1] ?? defaultNote();
      return [...p, { ...last }];
    });
    setSelected(pattern.length);
  };

  const removeNote = (index: number) => {
    setPattern((p) => (p.length > 1 ? p.filter((_, i) => i !== index) : p));
    setSelected((s) => Math.max(0, Math.min(s, pattern.length - 2)));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const levels = bpmLevels
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);
    const payload = {
      name,
      description,
      technique_id: Number(techniqueId),
      difficulty,
      bpm_levels: levels,
      visibility,
      note_pattern: pattern,
    };
    try {
      if (editing) {
        await api.put(`/exercises/${id}/`, payload);
      } else {
        await api.post("/exercises/", payload);
      }
      navigate("/");
    } catch (err: any) {
      const data = err?.response?.data;
      setError(
        data
          ? Object.entries(data)
              .map(([k, v]) => `${k}: ${[v].flat().join(" ")}`)
              .join(" · ")
          : "Could not save the exercise.",
      );
    }
  };

  const destroy = async () => {
    if (!editing) return;
    if (!window.confirm("Delete this exercise? Your past attempts on it are kept.")) return;
    await api.delete(`/exercises/${id}/`);
    navigate("/");
  };

  if (notFound)
    return (
      <p className="muted">
        Exercise not found or not yours to edit. <Link to="/">Back to the library</Link>
      </p>
    );

  const note = pattern[selected];

  return (
    <div>
      <p>
        <Link to="/">← Exercise library</Link>
      </p>
      <h2>{editing ? "Edit exercise" : "Create exercise"}</h2>
      <p className="muted">
        Build a note pattern, keep it private or share it with everyone. Custom exercises work
        everywhere: practice, scoring, leaderboards, challenges.
      </p>

      <form onSubmit={save}>
        <div className="editor-meta">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </label>
          <label>
            Technique
            <select value={techniqueId} onChange={(e) => setTechniqueId(e.target.value)}>
              {techniques.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Difficulty
            <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
              {[1, 2, 3, 4].map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY[d]}
                </option>
              ))}
            </select>
          </label>
          <label>
            BPM levels
            <input
              value={bpmLevels}
              onChange={(e) => setBpmLevels(e.target.value)}
              placeholder="60, 80, 100"
              required
            />
          </label>
          <label>
            Sharing
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as ExerciseVisibility)}
            >
              <option value="private">Private — only me</option>
              <option value="shared">Shared — visible to everyone</option>
            </select>
          </label>
          <label className="editor-desc">
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this train?"
            />
          </label>
        </div>

        <h3>Notes ({pattern.length})</h3>
        <p className="muted">
          Pick a note below to edit it — the selected note is highlighted in the tab. New notes
          are appended after the last one.
        </p>

        {timed && (
          <TabRenderer
            notes={timed.notes}
            totalBeats={timed.totalBeats}
            playheadBeat={null}
            results={pattern.map((_, i) => (i === selected ? "hit" : "pending"))}
            loop={null}
          />
        )}

        <div className="controls">
          <label>
            Note
            <select value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
              {pattern.map((n, i) => (
                <option key={i} value={i}>
                  #{i + 1} — s{n.string} f{n.fret}
                </option>
              ))}
            </select>
          </label>
          <label>
            String
            <select
              value={note.string}
              onChange={(e) => updateNote(selected, { string: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6].map((s) => (
                <option key={s} value={s}>
                  {s} ({["e", "B", "G", "D", "A", "E"][s - 1]})
                </option>
              ))}
            </select>
          </label>
          <label>
            Fret
            <input
              type="number"
              min={0}
              max={24}
              value={note.fret}
              onChange={(e) => updateNote(selected, { fret: Number(e.target.value) })}
              className="fret-input"
            />
          </label>
          <label>
            Duration
            <select
              value={note.duration}
              onChange={(e) => updateNote(selected, { duration: Number(e.target.value) })}
            >
              {DURATIONS.map((d) => (
                <option key={d.label} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Attack
            <select
              value={note.technique_marker}
              onChange={(e) =>
                updateNote(selected, { technique_marker: e.target.value as TechniqueMarker })
              }
            >
              {MARKERS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={addNote}>
            ＋ Add note
          </button>
          <button type="button" onClick={() => removeNote(selected)} disabled={pattern.length <= 1}>
            − Remove
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="controls">
          <button className="primary" type="submit">
            {editing ? "Save changes" : "Create exercise"}
          </button>
          {editing && (
            <button type="button" onClick={destroy}>
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
