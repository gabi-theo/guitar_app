import type { DetectedOnset } from "./onsets";
import type { NoteResult, TimedNote } from "../types";

export interface AttemptMetrics {
  timing_accuracy: number;
  pitch_accuracy: number;
  results: NoteResult[];
}

/**
 * Matches detected onsets against the expected pattern.
 *
 * Each expected note has a context-clock time (transport start + beat *
 * seconds-per-beat) and a tolerance window that narrows as BPM rises (it is
 * proportional to the note's own duration in seconds, clamped). A note is a
 * timing hit if any unconsumed onset lands in its window; it is also a pitch
 * hit if that onset's detected pitch matches the expected note (±1 semitone
 * rounding already applied on detection).
 */
export class AttemptScorer {
  private consumed = new Set<DetectedOnset>();
  readonly results: NoteResult[];
  private expectedTimes: number[];
  private tolerances: number[];

  constructor(
    private notes: TimedNote[],
    startCtxTime: number,
    secondsPerBeat: number,
  ) {
    this.results = notes.map(() => "pending");
    this.expectedTimes = notes.map((n) => startCtxTime + n.startBeat * secondsPerBeat);
    this.tolerances = notes.map((n) =>
      Math.min(0.15, Math.max(0.05, 0.5 * n.duration * secondsPerBeat)),
    );
  }

  /** Feed one onset; updates per-note results live. */
  handleOnset(onset: DetectedOnset): void {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.notes.length; i++) {
      if (this.results[i] === "hit" || this.results[i] === "wrong_pitch") continue;
      const dist = Math.abs(onset.time - this.expectedTimes[i]);
      if (dist <= this.tolerances[i] && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    if (best === -1 || this.consumed.has(onset)) return;
    this.consumed.add(onset);
    this.results[best] = onset.midi === this.notes[best].midi ? "hit" : "wrong_pitch";
  }

  /** Mark notes whose window has passed with no match. */
  markMissed(nowCtxTime: number): void {
    for (let i = 0; i < this.notes.length; i++) {
      if (this.results[i] === "pending" && nowCtxTime > this.expectedTimes[i] + this.tolerances[i]) {
        this.results[i] = "missed";
      }
    }
  }

  finalize(): AttemptMetrics {
    for (let i = 0; i < this.results.length; i++) {
      if (this.results[i] === "pending") this.results[i] = "missed";
    }
    const n = this.notes.length;
    const timingHits = this.results.filter((r) => r === "hit" || r === "wrong_pitch").length;
    const pitchHits = this.results.filter((r) => r === "hit").length;
    return {
      timing_accuracy: n ? timingHits / n : 0,
      pitch_accuracy: n ? pitchHits / n : 0,
      results: [...this.results],
    };
  }
}
