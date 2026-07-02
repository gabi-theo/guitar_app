import { useEffect, useRef, useState } from "react";

import { audioEngine } from "../audio/AudioEngine";
import { freqToMidiFloat, midiToFreq, midiToNoteName } from "../audio/noteMapping";

/** Open strings, string 1 (high E) first. */
const STRINGS = [
  { string: 1, midi: 64 },
  { string: 2, midi: 59 },
  { string: 3, midi: 55 },
  { string: 4, midi: 50 },
  { string: 5, midi: 45 },
  { string: 6, midi: 40 },
];

const IN_TUNE_CENTS = 5;
const SMOOTHING_FRAMES = 5;

interface Reading {
  midiFloat: number;
  freq: number;
}

export default function Tuner() {
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [level, setLevel] = useState(0);
  const recentRef = useRef<number[]>([]);
  const lastConfidentRef = useRef(0);

  useEffect(() => {
    if (!listening) return;
    const unsub = audioEngine.onFrame((frame) => {
      setLevel(frame.rms);
      if (frame.freq > 0 && frame.clarity > 0.9) {
        const recent = recentRef.current;
        recent.push(freqToMidiFloat(frame.freq));
        if (recent.length > SMOOTHING_FRAMES) recent.shift();
        const sorted = [...recent].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        lastConfidentRef.current = frame.time;
        setReading({ midiFloat: median, freq: midiToFreq(median) });
      } else if (frame.time - lastConfidentRef.current > 1.5) {
        // signal gone for a while — clear the display
        recentRef.current = [];
        setReading(null);
      }
    });
    return () => {
      unsub();
      audioEngine.stopMic();
    };
  }, [listening]);

  const start = async () => {
    setMicError(null);
    try {
      await audioEngine.startMic();
      setListening(true);
    } catch {
      setMicError("Microphone access is required for the tuner.");
    }
  };

  const stop = () => {
    setListening(false);
    setReading(null);
    setLevel(0);
  };

  const nearestMidi = reading ? Math.round(reading.midiFloat) : null;
  const cents = reading && nearestMidi !== null ? (reading.midiFloat - nearestMidi) * 100 : 0;
  const inTune = reading !== null && Math.abs(cents) <= IN_TUNE_CENTS;
  const nearestString =
    reading &&
    STRINGS.reduce((best, s) =>
      Math.abs(s.midi - reading.midiFloat) < Math.abs(best.midi - reading.midiFloat) ? s : best,
    );

  return (
    <div className="tuner">
      <h2>Tuner</h2>
      <p className="muted">Standard tuning (E A D G B e). Pluck one string at a time.</p>

      {!listening ? (
        <button className="primary" onClick={start}>
          🎤 Start tuner
        </button>
      ) : (
        <button onClick={stop}>■ Stop</button>
      )}
      {micError && <p className="error">{micError}</p>}

      {listening && (
        <>
          <div className="tuner-display">
            <div className={`tuner-note ${inTune ? "in-tune" : ""}`}>
              {nearestMidi !== null ? midiToNoteName(nearestMidi) : "—"}
            </div>
            <div className="muted">{reading ? `${reading.freq.toFixed(1)} Hz` : "listening…"}</div>

            {/* cents needle: -50 .. +50 */}
            <div className="tuner-meter">
              <div className="tuner-scale">
                <span>-50</span>
                <span>♭</span>
                <span className={inTune ? "in-tune" : ""}>0</span>
                <span>♯</span>
                <span>+50</span>
              </div>
              <div className="tuner-track">
                <div className="tuner-center" />
                {reading && (
                  <div
                    className={`tuner-needle ${inTune ? "in-tune" : ""}`}
                    style={{ left: `${50 + Math.max(-50, Math.min(50, cents))}%` }}
                  />
                )}
              </div>
              <div className="muted tuner-cents">
                {reading ? `${cents > 0 ? "+" : ""}${cents.toFixed(0)} cents` : " "}
              </div>
            </div>

            {/* input level */}
            <div className="level-track">
              <div
                className="level-fill"
                style={{ width: `${Math.min(100, level * 800)}%` }}
              />
            </div>
          </div>

          <div className="tuner-strings">
            {STRINGS.map((s) => {
              const active = nearestString?.string === s.string;
              const stringTuned = active && inTune;
              return (
                <div key={s.string} className={`tuner-string ${active ? "active" : ""} ${stringTuned ? "in-tune" : ""}`}>
                  <span className="big">{midiToNoteName(s.midi)}</span>
                  <span className="muted">{midiToFreq(s.midi).toFixed(1)} Hz</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
