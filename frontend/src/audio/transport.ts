import { scheduleClick } from "./metronome";
import { playNote } from "./synth";
import type { TimedNote } from "../types";

export interface LoopRegion {
  startBeat: number;
  endBeat: number;
}

export interface TransportOptions {
  bpm: number;
  notes: TimedNote[];
  totalBeats: number;
  playClicks: boolean;
  playNotes: boolean; // note-preview synth
  loop: LoopRegion | null; // repeat a section (preview/practice tool)
  repeat: boolean; // loop the whole pattern when no region is set
  countInBeats: number;
  onComplete?: () => void;
}

interface Segment {
  ctxTime: number; // context time at which this segment starts
  beat: number; // pattern beat at that moment
}

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

/**
 * The shared playback clock (Songsterr-style). One Transport drives the
 * metronome clicks, the preview synth, and — via `patternBeatAt` — the tab
 * playhead and the scoring engine's expected-onset times. Everything is
 * scheduled ahead on the AudioContext clock, so UI jank can't shift audio.
 */
export class Transport {
  private ctx: AudioContext;
  private opts: TransportOptions;
  private timer: number | null = null;
  private segments: Segment[] = [];
  private schedBeat = 0; // next pattern beat to schedule (virtual, pre-loop-wrap)
  private schedCtxTime = 0; // context time corresponding to schedBeat
  private nextNoteIdx = 0;
  private nextClickBeat = 0;
  private completed = false;

  readonly startCtxTime: number; // context time of pattern beat 0 (first pass)
  readonly secondsPerBeat: number;

  constructor(ctx: AudioContext, opts: TransportOptions) {
    this.ctx = ctx;
    this.opts = opts;
    this.secondsPerBeat = 60 / opts.bpm;

    const now = ctx.currentTime + 0.1;
    this.startCtxTime = now + opts.countInBeats * this.secondsPerBeat;

    // count-in clicks (all accented) — not part of the pattern
    if (opts.countInBeats > 0) {
      for (let i = 0; i < opts.countInBeats; i++) {
        scheduleClick(ctx, now + i * this.secondsPerBeat, true);
      }
    }

    const loopStart = opts.loop?.startBeat ?? 0;
    this.schedBeat = loopStart;
    this.schedCtxTime = this.startCtxTime;
    this.nextClickBeat = Math.floor(loopStart);
    this.nextNoteIdx = this.firstNoteIndexAt(loopStart);
    this.segments.push({ ctxTime: this.startCtxTime, beat: loopStart });

    this.tick = this.tick.bind(this);
    this.timer = window.setInterval(this.tick, TICK_MS);
    this.tick();
  }

  private firstNoteIndexAt(beat: number): number {
    const { notes } = this.opts;
    for (let i = 0; i < notes.length; i++) {
      if (notes[i].startBeat >= beat - 1e-6) return i;
    }
    return notes.length;
  }

  private regionEnd(): number {
    return this.opts.loop ? this.opts.loop.endBeat : this.opts.totalBeats;
  }

  private tick(): void {
    if (this.completed) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD_S;
    const spb = this.secondsPerBeat;
    const { notes, playClicks, playNotes, loop, repeat } = this.opts;

    while (this.schedCtxTime < horizon) {
      const regionEnd = this.regionEnd();

      // next event among: metronome click, note start, region end
      let nextBeat = regionEnd;
      let kind: "click" | "note" | "end" = "end";

      if (playClicks && this.nextClickBeat < regionEnd - 1e-6 && this.nextClickBeat <= nextBeat) {
        nextBeat = this.nextClickBeat;
        kind = "click";
      }
      if (this.nextNoteIdx < notes.length) {
        const nb = notes[this.nextNoteIdx].startBeat;
        if (nb < regionEnd - 1e-6 && nb < nextBeat - 1e-9) {
          nextBeat = nb;
          kind = "note";
        } else if (nb < regionEnd - 1e-6 && Math.abs(nb - nextBeat) < 1e-9 && kind === "end") {
          nextBeat = nb;
          kind = "note";
        }
      }

      const eventCtxTime = this.schedCtxTime + (nextBeat - this.schedBeat) * spb;

      if (kind === "click") {
        scheduleClick(this.ctx, eventCtxTime, this.nextClickBeat % 4 === 0);
        this.nextClickBeat += 1;
        // don't advance schedBeat past coincident notes
        this.schedBeat = nextBeat;
        this.schedCtxTime = eventCtxTime;
        continue;
      }

      if (kind === "note") {
        const note = notes[this.nextNoteIdx];
        if (playNotes) {
          playNote(this.ctx, note.midi, eventCtxTime, note.duration, spb);
        }
        this.nextNoteIdx += 1;
        this.schedBeat = nextBeat;
        this.schedCtxTime = eventCtxTime;
        continue;
      }

      // kind === "end": wrap or finish
      if (loop || repeat) {
        const wrapStart = loop ? loop.startBeat : 0;
        this.segments.push({ ctxTime: eventCtxTime, beat: wrapStart });
        this.schedBeat = wrapStart;
        this.schedCtxTime = eventCtxTime;
        this.nextClickBeat = Math.floor(wrapStart);
        this.nextNoteIdx = this.firstNoteIndexAt(wrapStart);
        continue;
      }

      // single pass: fire completion once real time reaches the end
      this.completed = true;
      const delayMs = Math.max(0, (eventCtxTime - this.ctx.currentTime) * 1000);
      window.setTimeout(() => {
        this.stop();
        this.opts.onComplete?.();
      }, delayMs + 30);
      break;
    }
  }

  /** Pattern beat at a given context time (handles loop wrapping and count-in). */
  patternBeatAt(ctxTime: number): number {
    if (ctxTime <= this.startCtxTime) {
      // during count-in, report negative beats so the UI can show it
      return (ctxTime - this.startCtxTime) / this.secondsPerBeat;
    }
    let seg = this.segments[0];
    for (const s of this.segments) {
      if (s.ctxTime <= ctxTime) seg = s;
      else break;
    }
    return seg.beat + (ctxTime - seg.ctxTime) / this.secondsPerBeat;
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.completed = true;
  }
}

/** Enrich a raw pattern with cumulative start beats and midi numbers. */
export function timeNotes(
  pattern: { string: number; fret: number; duration: number; technique_marker: string }[],
  stringFretToMidi: (s: number, f: number) => number,
): { notes: TimedNote[]; totalBeats: number } {
  let beat = 0;
  const notes: TimedNote[] = pattern.map((n, index) => {
    const timed: TimedNote = {
      ...(n as TimedNote),
      index,
      startBeat: beat,
      midi: stringFretToMidi(n.string, n.fret),
    };
    beat += n.duration;
    return timed;
  });
  // round total up to a whole measure (4/4) so the click track resolves
  const totalBeats = Math.ceil(beat - 1e-6);
  return { notes, totalBeats };
}
