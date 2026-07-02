/**
 * Owns the single AudioContext shared by everything audio-related: mic
 * analysis (pitch worklet), the note-preview synth, and the metronome all
 * schedule against this context's clock, which is what keeps the tab
 * playhead, clicks, synth notes and scoring windows in sync.
 */

export interface AnalysisFrame {
  time: number; // AudioContext time of the analysed window's end
  freq: number; // 0 if no confident pitch
  clarity: number;
  rms: number;
}

type FrameListener = (frame: AnalysisFrame) => void;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletLoaded = false;
  private listeners = new Set<FrameListener>();

  /** Lazily create (and resume) the shared context. Must follow a user gesture. */
  async context(): Promise<AudioContext> {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  async startMic(): Promise<void> {
    const ctx = await this.context();
    if (this.micSource) return; // already listening

    if (!this.workletLoaded) {
      await ctx.audioWorklet.addModule("/worklets/pitch-processor.js");
      this.workletLoaded = true;
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    this.micSource = ctx.createMediaStreamSource(this.micStream);
    this.workletNode = new AudioWorkletNode(ctx, "pitch-processor");
    this.workletNode.port.onmessage = (e: MessageEvent<AnalysisFrame>) => {
      for (const l of this.listeners) l(e.data);
    };
    this.micSource.connect(this.workletNode);
    // worklet has no audio output; no need to connect to destination
  }

  stopMic(): void {
    this.workletNode?.disconnect();
    this.micSource?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.workletNode = null;
    this.micSource = null;
    this.micStream = null;
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** App-wide singleton. */
export const audioEngine = new AudioEngine();
