import { midiToFreq } from "./noteMapping";

/**
 * Note-preview synth: Karplus-Strong plucked-string approximation rendered
 * into an AudioBuffer per pitch (cached). Not aiming for sampled-guitar
 * fidelity — just a clear practice cue, like Songsterr's tab playback.
 */

const cache = new Map<string, AudioBuffer>();

function renderPluck(ctx: AudioContext, freq: number, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * seconds);
  const buffer = ctx.createBuffer(1, length, sr);
  const out = buffer.getChannelData(0);

  const period = Math.max(2, Math.round(sr / freq));
  const delay = new Float32Array(period);
  for (let i = 0; i < period; i++) delay[i] = Math.random() * 2 - 1;

  const damping = 0.996;
  let idx = 0;
  for (let i = 0; i < length; i++) {
    const next = (idx + 1) % period;
    const sample = delay[idx];
    delay[idx] = damping * 0.5 * (delay[idx] + delay[next]);
    out[i] = sample;
    idx = next;
  }
  return buffer;
}

export function playNote(
  ctx: AudioContext,
  midi: number,
  when: number,
  durationBeats: number,
  secondsPerBeat: number,
  gainValue = 0.5,
): void {
  const freq = midiToFreq(midi);
  const seconds = Math.min(1.5, Math.max(0.3, durationBeats * secondsPerBeat * 1.5));
  const key = `${midi}:${Math.round(seconds * 10)}:${ctx.sampleRate}`;
  let buffer = cache.get(key);
  if (!buffer) {
    buffer = renderPluck(ctx, freq, seconds);
    cache.set(key, buffer);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + seconds);
  source.connect(gain).connect(ctx.destination);
  source.start(when);
}
