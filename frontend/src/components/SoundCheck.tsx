import { useEffect, useRef, useState } from "react";

import { audioEngine } from "../audio/AudioEngine";
import { freqToNearestMidi, midiToNoteName } from "../audio/noteMapping";

const RMS_OK = 0.01;
const CONFIDENT_FRAMES_NEEDED = 8;

interface Props {
  onPassed: () => void;
  onCancel: () => void;
}

/**
 * Pre-attempt sound check: confirms the mic hears the guitar (signal level)
 * and that pitch detection locks onto it, before any attempt is scored.
 * Passes once enough confident pitch frames have been seen.
 */
export default function SoundCheck({ onPassed, onCancel }: Props) {
  const [micError, setMicError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [signalOk, setSignalOk] = useState(false);
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [confidentCount, setConfidentCount] = useState(0);
  const [passed, setPassed] = useState(false);
  const passedRef = useRef(false);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        await audioEngine.startMic();
      } catch {
        if (!cancelled) setMicError("Microphone access was denied — allow it to continue.");
        return;
      }
      if (cancelled) return;
      unsub = audioEngine.onFrame((frame) => {
        setLevel(frame.rms);
        if (frame.rms > RMS_OK) setSignalOk(true);
        if (frame.freq > 0 && frame.clarity > 0.85 && frame.rms > RMS_OK) {
          setLastNote(midiToNoteName(freqToNearestMidi(frame.freq)));
          setConfidentCount((c) => {
            const next = c + 1;
            if (next >= CONFIDENT_FRAMES_NEEDED && !passedRef.current) {
              passedRef.current = true;
              setPassed(true);
            }
            return next;
          });
        }
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
      // don't stop the mic here: on pass, the attempt reuses the stream
    };
  }, []);

  const pitchOk = confidentCount >= CONFIDENT_FRAMES_NEEDED;

  return (
    <div className="sound-check">
      <h3>Sound check</h3>
      <p className="muted">Play a few notes on your guitar so we can hear you.</p>
      {micError ? (
        <p className="error">{micError}</p>
      ) : (
        <>
          <div className="level-track">
            <div className="level-fill" style={{ width: `${Math.min(100, level * 800)}%` }} />
          </div>
          <ul className="checklist">
            <li className={signalOk ? "ok" : ""}>{signalOk ? "✓" : "○"} Signal detected</li>
            <li className={pitchOk ? "ok" : ""}>
              {pitchOk ? "✓" : "○"} Pitch detected{lastNote ? ` (heard ${lastNote})` : ""}
            </li>
          </ul>
        </>
      )}
      <div className="controls">
        {passed ? (
          <button className="primary" onClick={onPassed}>
            ✓ Sounding good — start attempt
          </button>
        ) : (
          <button
            onClick={() => {
              audioEngine.stopMic();
              onCancel();
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
