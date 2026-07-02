/** Single scheduled metronome click. Accented clicks are higher-pitched. */
export function scheduleClick(ctx: AudioContext, when: number, accent = false): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1200 : 800;
  gain.gain.setValueAtTime(accent ? 0.5 : 0.35, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when);
  osc.stop(when + 0.06);
}
