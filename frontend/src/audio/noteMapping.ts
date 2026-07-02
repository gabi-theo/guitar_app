/** Standard tuning, string 1 = high E. MIDI numbers of open strings. */
const OPEN_STRING_MIDI: Record<number, number> = {
  1: 64, // E4
  2: 59, // B3
  3: 55, // G3
  4: 50, // D3
  5: 45, // A2
  6: 40, // E2
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function stringFretToMidi(string: number, fret: number): number {
  return OPEN_STRING_MIDI[string] + fret;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidiFloat(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function freqToNearestMidi(freq: number): number {
  return Math.round(freqToMidiFloat(freq));
}

export function midiToNoteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * Map a detected frequency to the most plausible string/fret under standard
 * tuning: among all strings that can produce the note (fret 0-24), prefer the
 * one closest to a hinted string (the string the exercise expects), else the
 * lowest fret.
 */
export function freqToStringFret(
  freq: number,
  hintString?: number,
): { string: number; fret: number; midi: number } | null {
  const midi = freqToNearestMidi(freq);
  const candidates: { string: number; fret: number }[] = [];
  for (let s = 1; s <= 6; s++) {
    const fret = midi - OPEN_STRING_MIDI[s];
    if (fret >= 0 && fret <= 24) candidates.push({ string: s, fret });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (hintString !== undefined) {
      const da = Math.abs(a.string - hintString);
      const db = Math.abs(b.string - hintString);
      if (da !== db) return da - db;
    }
    return a.fret - b.fret;
  });
  return { ...candidates[0], midi };
}
