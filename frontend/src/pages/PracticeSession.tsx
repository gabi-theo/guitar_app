import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import api from "../api/client";
import { audioEngine } from "../audio/AudioEngine";
import { AttemptScorer } from "../audio/attemptScorer";
import { stringFretToMidi } from "../audio/noteMapping";
import { OnsetDetector } from "../audio/onsets";
import { Transport, timeNotes, type LoopRegion } from "../audio/transport";
import SoundCheck from "../components/SoundCheck";
import TabRenderer, { BEATS_PER_MEASURE } from "../components/TabRenderer/TabRenderer";
import type { Challenge, Exercise, NoteResult, PracticeAttempt } from "../types";

const COUNT_IN_BEATS = 4;

type Mode = "idle" | "preview" | "attempt";

export default function PracticeSession() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const challengeId = searchParams.get("challenge");
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengeMsg, setChallengeMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [playheadBeat, setPlayheadBeat] = useState<number | null>(null);
  const [results, setResults] = useState<NoteResult[] | undefined>(undefined);
  const [lastAttempt, setLastAttempt] = useState<PracticeAttempt | null>(null);
  const [loop, setLoop] = useState<LoopRegion | null>(null);
  const [loopAnchor, setLoopAnchor] = useState<number | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [liveNote, setLiveNote] = useState<string>("");
  const [showSoundCheck, setShowSoundCheck] = useState(false);

  const transportRef = useRef<Transport | null>(null);
  const scorerRef = useRef<AttemptScorer | null>(null);
  const detectorRef = useRef<OnsetDetector | null>(null);
  const unsubFrameRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number>(0);
  const modeRef = useRef<Mode>("idle");
  modeRef.current = mode;

  useEffect(() => {
    api.get<Exercise>(`/exercises/${id}/`).then(({ data }) => {
      setExercise(data);
      const urlBpm = Number(searchParams.get("bpm"));
      setBpm(data.bpm_levels.includes(urlBpm) ? urlBpm : (data.bpm_levels[0] ?? 100));
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!challengeId) return;
    api.get<Challenge>(`/challenges/${challengeId}/`).then(({ data }) => setChallenge(data));
  }, [challengeId]);

  const timed = useMemo(
    () => (exercise?.note_pattern ? timeNotes(exercise.note_pattern, stringFretToMidi) : null),
    [exercise],
  );

  const stopEverything = useCallback(() => {
    transportRef.current?.stop();
    transportRef.current = null;
    cancelAnimationFrame(rafRef.current);
    unsubFrameRef.current?.();
    unsubFrameRef.current = null;
    audioEngine.stopMic();
    setPlayheadBeat(null);
    setMode("idle");
  }, []);

  useEffect(() => () => stopEverything(), [stopEverything]);

  const runPlayhead = useCallback(() => {
    const step = () => {
      const t = transportRef.current;
      if (!t) return;
      const now = audioEngine.now();
      setPlayheadBeat(Math.max(0, t.patternBeatAt(now)));
      if (modeRef.current === "attempt" && scorerRef.current) {
        scorerRef.current.markMissed(now);
        setResults([...scorerRef.current.results]);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const startPreview = useCallback(async () => {
    if (!timed || !bpm) return;
    stopEverything();
    const ctx = await audioEngine.context();
    transportRef.current = new Transport(ctx, {
      bpm,
      notes: timed.notes,
      totalBeats: timed.totalBeats,
      playClicks: true,
      playNotes: true,
      loop,
      repeat: true, // preview loops until stopped
      countInBeats: 0,
    });
    setMode("preview");
    setResults(undefined);
    runPlayhead();
  }, [timed, bpm, loop, stopEverything, runPlayhead]);

  const startAttempt = useCallback(async () => {
    if (!timed || !bpm || !exercise) return;
    stopEverything();
    setMicError(null);
    try {
      await audioEngine.startMic();
    } catch {
      setMicError("Microphone access is required to score an attempt.");
      return;
    }
    const ctx = await audioEngine.context();

    // attempts always run the full pattern once — the loop is a practice tool
    const transport = new Transport(ctx, {
      bpm,
      notes: timed.notes,
      totalBeats: timed.totalBeats,
      playClicks: true,
      playNotes: false, // you play the notes
      loop: null,
      repeat: false,
      countInBeats: COUNT_IN_BEATS,
      onComplete: () => finishAttempt(),
    });
    transportRef.current = transport;

    const scorer = new AttemptScorer(timed.notes, transport.startCtxTime, transport.secondsPerBeat);
    scorerRef.current = scorer;
    const detector = new OnsetDetector((onset) => scorer.handleOnset(onset));
    detectorRef.current = detector;
    unsubFrameRef.current = audioEngine.onFrame((frame) => {
      detector.handleFrame(frame);
      if (frame.freq > 0) {
        setLiveNote(`${frame.freq.toFixed(1)} Hz`);
      }
    });

    setResults(timed.notes.map(() => "pending"));
    setLastAttempt(null);
    setMode("attempt");
    runPlayhead();
  }, [timed, bpm, exercise, stopEverything, runPlayhead]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Gate attempts behind a one-per-session sound check. */
  const requestAttempt = useCallback(() => {
    if (sessionStorage.getItem("soundCheckPassed") === "1") {
      startAttempt();
    } else {
      stopEverything();
      setShowSoundCheck(true);
    }
  }, [startAttempt, stopEverything]);

  const finishAttempt = useCallback(async () => {
    const scorer = scorerRef.current;
    if (!scorer || !exercise || !bpm) return;
    const metrics = scorer.finalize();
    setResults(metrics.results);
    cancelAnimationFrame(rafRef.current);
    unsubFrameRef.current?.();
    unsubFrameRef.current = null;
    audioEngine.stopMic();
    setPlayheadBeat(null);
    setMode("idle");
    try {
      const { data } = await api.post<PracticeAttempt>("/attempts/", {
        exercise: exercise.id,
        bpm_target: bpm,
        timing_accuracy: metrics.timing_accuracy,
        pitch_accuracy: metrics.pitch_accuracy,
        bpm_achieved: bpm,
      });
      setLastAttempt(data);

      // playing against a challenge: submit this attempt as my entry
      if (challengeId && challenge && challenge.status === "open") {
        try {
          const res = await api.post<Challenge>(`/challenges/${challengeId}/submit/`, {
            attempt: data.id,
          });
          setChallenge(res.data);
          if (res.data.status === "complete") {
            setChallengeMsg(
              res.data.winner_name === null
                ? "Challenge resolved: it's a draw!"
                : `Challenge resolved: ${res.data.winner_name} wins!`,
            );
          } else {
            setChallengeMsg("Your attempt is in — waiting for your opponent.");
          }
        } catch (err: any) {
          setChallengeMsg(
            err?.response?.data?.detail ?? "Could not submit this attempt to the challenge.",
          );
        }
      }
    } catch {
      setMicError("Attempt finished but could not be saved — is the backend running?");
    }
  }, [exercise, bpm, challengeId, challenge]);

  const handleMeasureClick = useCallback(
    (measure: number) => {
      if (mode !== "idle") return;
      const start = measure * BEATS_PER_MEASURE;
      const end = Math.min((measure + 1) * BEATS_PER_MEASURE, timed?.totalBeats ?? 0);
      if (loopAnchor === null) {
        setLoop({ startBeat: start, endBeat: end });
        setLoopAnchor(measure);
      } else {
        const lo = Math.min(loopAnchor, measure) * BEATS_PER_MEASURE;
        const hi = Math.min(
          (Math.max(loopAnchor, measure) + 1) * BEATS_PER_MEASURE,
          timed?.totalBeats ?? 0,
        );
        setLoop({ startBeat: lo, endBeat: hi });
        setLoopAnchor(null);
      }
    },
    [mode, loopAnchor, timed],
  );

  if (!exercise || !timed || bpm === null) return <p className="muted">Loading exercise…</p>;

  return (
    <div>
      <p>
        <Link to="/">← Exercise library</Link>
      </p>
      <h2>{exercise.name}</h2>
      <p className="muted">
        {exercise.technique.name} · {exercise.description}
      </p>

      {challenge && (
        <div className="challenge-banner">
          ⚔ Challenge: <strong>{challenge.challenger_name}</strong> vs{" "}
          <strong>{challenge.opponent_name}</strong> @ {challenge.bpm_target} BPM — best score wins.{" "}
          <Link to="/challenges">All challenges</Link>
          {challengeMsg && <div className="success">{challengeMsg}</div>}
        </div>
      )}

      <div className="controls">
        <label>
          Tempo:{" "}
          <select
            value={bpm}
            disabled={mode !== "idle" || challenge !== null}
            onChange={(e) => setBpm(Number(e.target.value))}
          >
            {exercise.bpm_levels.map((b) => (
              <option key={b} value={b}>
                {b} BPM
              </option>
            ))}
          </select>
        </label>

        {mode === "idle" ? (
          <>
            <button disabled={showSoundCheck} onClick={startPreview}>
              ▶ Preview
            </button>
            <button className="primary" disabled={showSoundCheck} onClick={requestAttempt}>
              ● Start attempt
            </button>
          </>
        ) : (
          <button onClick={stopEverything}>■ Stop</button>
        )}

        {loop && mode === "idle" && (
          <button
            onClick={() => {
              setLoop(null);
              setLoopAnchor(null);
            }}
          >
            Clear loop
          </button>
        )}
        <span className="muted">
          {mode === "idle"
            ? "Click a measure number to loop it (click a second one to extend)."
            : mode === "attempt" && playheadBeat === null
              ? ""
              : mode === "attempt"
                ? `Listening… ${liveNote}`
                : "Previewing (loops until stopped)."}
        </span>
      </div>

      {micError && <p className="error">{micError}</p>}

      {showSoundCheck && (
        <SoundCheck
          onPassed={() => {
            sessionStorage.setItem("soundCheckPassed", "1");
            setShowSoundCheck(false);
            startAttempt();
          }}
          onCancel={() => setShowSoundCheck(false)}
        />
      )}

      <TabRenderer
        notes={timed.notes}
        totalBeats={timed.totalBeats}
        playheadBeat={playheadBeat}
        results={results}
        loop={loop}
        onMeasureClick={handleMeasureClick}
      />

      {mode === "attempt" && playheadBeat !== null && playheadBeat === 0 && (
        <p className="muted">Count-in…</p>
      )}

      {lastAttempt && (
        <div className="score-card">
          <h3>Attempt scored!</h3>
          <div className="score-grid">
            <div>
              <span className="big">{lastAttempt.score.toFixed(1)}</span>
              <span className="muted">score</span>
            </div>
            <div>
              <span className="big">{(lastAttempt.accuracy * 100).toFixed(0)}%</span>
              <span className="muted">accuracy</span>
            </div>
            <div>
              <span className="big">{(lastAttempt.timing_accuracy * 100).toFixed(0)}%</span>
              <span className="muted">timing</span>
            </div>
            <div>
              <span className="big">{(lastAttempt.pitch_accuracy * 100).toFixed(0)}%</span>
              <span className="muted">pitch</span>
            </div>
          </div>
          <p className="muted">
            score = accuracy × BPM. <Link to="/history">View history</Link>
          </p>
        </div>
      )}
    </div>
  );
}
