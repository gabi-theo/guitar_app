/**
 * Pitch + level analysis AudioWorklet.
 *
 * Implements the McLeod Pitch Method (the same algorithm as the `pitchy`
 * package: NSDF + key-maximum picking + parabolic interpolation), inlined in
 * plain JS because worklet modules are loaded outside the bundler and cannot
 * import npm dependencies.
 *
 * Every HOP samples it posts a frame to the main thread:
 *   { time, freq, clarity, rms }
 * Onset decisions are made on the main thread (audio/onsets.ts) where they
 * can be combined with pitch-change detection for legato notes.
 */

const WINDOW = 2048;
const HOP = 1024;
const MIN_FREQ = 70; // below low E (82.4 Hz) with margin
const MAX_FREQ = 1400; // above fret 24 on high E (~1319 Hz)
const CLARITY_THRESHOLD = 0.8;

class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(WINDOW);
    this.filled = 0;
    this.sinceLastHop = 0;
    this.nsdf = new Float32Array(Math.floor(sampleRate / MIN_FREQ) + 1);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const samples = input[0];

    for (let i = 0; i < samples.length; i++) {
      // sliding window: shift by HOP once full
      if (this.filled === WINDOW) {
        this.buffer.copyWithin(0, HOP);
        this.filled = WINDOW - HOP;
      }
      this.buffer[this.filled++] = samples[i];
      this.sinceLastHop++;

      if (this.filled === WINDOW && this.sinceLastHop >= HOP) {
        this.sinceLastHop = 0;
        this.analyze();
      }
    }
    return true;
  }

  analyze() {
    const buf = this.buffer;
    let sumSq = 0;
    for (let i = 0; i < WINDOW; i++) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / WINDOW);

    let freq = 0;
    let clarity = 0;
    if (rms > 0.005) {
      const result = this.mpm(buf);
      if (result && result.clarity >= CLARITY_THRESHOLD) {
        freq = result.freq;
        clarity = result.clarity;
      } else if (result) {
        clarity = result.clarity;
      }
    }

    // currentFrame is the position of the *next* block; the window we
    // analysed ends (approximately) now.
    this.port.postMessage({ time: currentFrame / sampleRate, freq, clarity, rms });
  }

  /** McLeod Pitch Method over the current window. */
  mpm(buf) {
    const tauMin = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
    const tauMax = Math.min(Math.floor(sampleRate / MIN_FREQ), WINDOW - 1);
    const nsdf = this.nsdf;

    // NSDF: n(tau) = 2 * acf(tau) / (m(tau))
    for (let tau = tauMin; tau <= tauMax; tau++) {
      let acf = 0;
      let m = 0;
      for (let i = 0; i < WINDOW - tau; i++) {
        const a = buf[i];
        const b = buf[i + tau];
        acf += a * b;
        m += a * a + b * b;
      }
      nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
    }

    // key maxima between positive zero crossings
    const maxima = [];
    let tau = tauMin;
    // skip until first negative-going region so we don't pick the tau≈0 peak
    while (tau <= tauMax && nsdf[tau] > 0) tau++;
    while (tau <= tauMax) {
      // find next positive crossing
      while (tau <= tauMax && nsdf[tau] <= 0) tau++;
      if (tau > tauMax) break;
      // track maximum until next negative crossing
      let bestTau = tau;
      let bestVal = nsdf[tau];
      while (tau <= tauMax && nsdf[tau] > 0) {
        if (nsdf[tau] > bestVal) {
          bestVal = nsdf[tau];
          bestTau = tau;
        }
        tau++;
      }
      maxima.push({ tau: bestTau, val: bestVal });
    }
    if (maxima.length === 0) return null;

    let highest = 0;
    for (const m of maxima) if (m.val > highest) highest = m.val;
    const threshold = 0.9 * highest;
    let chosen = null;
    for (const m of maxima) {
      if (m.val >= threshold) {
        chosen = m;
        break;
      }
    }
    if (!chosen) return null;

    // parabolic interpolation around the chosen peak
    const t = chosen.tau;
    let refinedTau = t;
    if (t > tauMin && t < tauMax) {
      const y1 = nsdf[t - 1];
      const y2 = nsdf[t];
      const y3 = nsdf[t + 1];
      const denom = 2 * (2 * y2 - y1 - y3);
      if (Math.abs(denom) > 1e-12) refinedTau = t + (y3 - y1) / denom;
    }

    return { freq: sampleRate / refinedTau, clarity: chosen.val };
  }
}

registerProcessor("pitch-processor", PitchProcessor);
