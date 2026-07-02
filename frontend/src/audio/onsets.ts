import { freqToMidiFloat } from "./noteMapping";
import type { AnalysisFrame } from "./AudioEngine";

export interface DetectedOnset {
  time: number; // AudioContext time
  midi: number | null; // filled in from the first confident pitch after the attack
}

const RMS_FLOOR = 0.01;
const RISE_FACTOR = 1.6;
const REFRACTORY_S = 0.06;
const PITCH_FILL_WINDOW_S = 0.12;
const LEGATO_SEMITONE_JUMP = 0.75;

/**
 * Turns the worklet's analysis frames into note onsets.
 *
 * Two triggers, per the design:
 *  - RMS envelope peak: level jumps well above the recent envelope (picked
 *    and tapped notes).
 *  - Pitch-change confirmation: a sustained, confident pitch moves to a new
 *    semitone without a level spike (hammer-ons / pull-offs).
 *
 * The onset's pitch is taken from the first confident frame within a short
 * window after the attack, since pitch is garbage during the transient.
 */
export class OnsetDetector {
  private prevRms = 0;
  private lastOnsetTime = -Infinity;
  private lastStableMidi: number | null = null;
  private pendingPitch: DetectedOnset | null = null;
  readonly onsets: DetectedOnset[] = [];

  constructor(private onOnset?: (onset: DetectedOnset) => void) {}

  reset(): void {
    this.prevRms = 0;
    this.lastOnsetTime = -Infinity;
    this.lastStableMidi = null;
    this.pendingPitch = null;
    this.onsets.length = 0;
  }

  handleFrame(frame: AnalysisFrame): void {
    const { time, freq, clarity, rms } = frame;
    const confident = freq > 0 && clarity > 0.85;
    const midiFloat = confident ? freqToMidiFloat(freq) : null;

    // fill pitch of a recent onset from the first confident frame after it
    if (this.pendingPitch && midiFloat !== null) {
      if (time - this.pendingPitch.time <= PITCH_FILL_WINDOW_S) {
        this.pendingPitch.midi = Math.round(midiFloat);
        this.lastStableMidi = midiFloat;
        this.pendingPitch = null;
      } else {
        this.pendingPitch = null; // window expired, leave midi null
      }
    }

    const refractoryOver = time - this.lastOnsetTime > REFRACTORY_S;
    let isOnset = false;

    // trigger 1: level spike
    if (refractoryOver && rms > RMS_FLOOR && rms > this.prevRms * RISE_FACTOR) {
      isOnset = true;
    }

    // trigger 2: legato pitch change while level is sustained
    if (
      !isOnset &&
      refractoryOver &&
      midiFloat !== null &&
      this.lastStableMidi !== null &&
      rms > RMS_FLOOR &&
      Math.abs(midiFloat - this.lastStableMidi) >= LEGATO_SEMITONE_JUMP
    ) {
      isOnset = true;
    }

    if (isOnset) {
      const onset: DetectedOnset = { time, midi: midiFloat !== null ? Math.round(midiFloat) : null };
      this.onsets.push(onset);
      this.lastOnsetTime = time;
      if (midiFloat === null) this.pendingPitch = onset;
      this.onOnset?.(onset);
    }

    if (midiFloat !== null) this.lastStableMidi = midiFloat;
    // slow-decay envelope so a sustained note doesn't retrigger
    this.prevRms = Math.max(rms, this.prevRms * 0.92);
  }
}
