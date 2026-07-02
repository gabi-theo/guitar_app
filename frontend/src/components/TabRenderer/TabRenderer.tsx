import { useEffect, useRef } from "react";

import type { LoopRegion } from "../../audio/transport";
import type { NoteResult, TimedNote } from "../../types";

const PX_PER_BEAT = 96;
const LEFT_PAD = 48;
const RIGHT_PAD = 48;
const STRING_GAP = 22;
const TOP_PAD = 34;
const BEATS_PER_MEASURE = 4;

const MARKER_LABEL: Record<string, string> = {
  hammer: "h",
  pull: "p",
  tap: "t",
  slide: "/",
};

interface Props {
  notes: TimedNote[];
  totalBeats: number;
  playheadBeat: number | null; // null = not playing
  results?: NoteResult[]; // live attempt feedback per note
  loop: LoopRegion | null;
  onMeasureClick?: (measure: number) => void;
}

function beatX(beat: number): number {
  return LEFT_PAD + beat * PX_PER_BEAT;
}

/**
 * Songsterr-style interactive tab: SVG staff with fret numbers, a playhead
 * synced to the transport clock, current-note highlighting, per-note
 * hit/miss coloring during attempts, and clickable measure headers for
 * setting a loop region. Auto-scrolls to keep the playhead in view.
 */
export default function TabRenderer({
  notes,
  totalBeats,
  playheadBeat,
  results,
  loop,
  onMeasureClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const width = beatX(totalBeats) + RIGHT_PAD;
  const height = TOP_PAD + 5 * STRING_GAP + 28;
  const measures = Math.ceil(totalBeats / BEATS_PER_MEASURE);

  // auto-scroll: keep playhead ~35% from the left edge while playing
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || playheadBeat === null) return;
    const target = beatX(Math.max(0, playheadBeat)) - el.clientWidth * 0.35;
    el.scrollLeft = Math.max(0, target);
  }, [playheadBeat]);

  const stringY = (s: number) => TOP_PAD + (s - 1) * STRING_GAP;

  return (
    <div ref={scrollRef} className="tab-scroll">
      <svg width={width} height={height}>
        {/* loop region background */}
        {loop && (
          <rect
            x={beatX(loop.startBeat)}
            y={TOP_PAD - 14}
            width={(loop.endBeat - loop.startBeat) * PX_PER_BEAT}
            height={5 * STRING_GAP + 28}
            className="tab-loop-region"
          />
        )}

        {/* measure lines + clickable measure headers */}
        {Array.from({ length: measures + 1 }, (_, m) => (
          <g key={`m${m}`}>
            <line
              x1={beatX(m * BEATS_PER_MEASURE)}
              x2={beatX(m * BEATS_PER_MEASURE)}
              y1={stringY(1)}
              y2={stringY(6)}
              className="tab-measure-line"
            />
            {m < measures && (
              <text
                x={beatX(m * BEATS_PER_MEASURE) + 4}
                y={TOP_PAD - 18}
                className="tab-measure-number"
                onClick={() => onMeasureClick?.(m)}
              >
                {m + 1}
              </text>
            )}
          </g>
        ))}

        {/* strings */}
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <line
            key={`s${s}`}
            x1={LEFT_PAD - 24}
            x2={width - RIGHT_PAD / 2}
            y1={stringY(s)}
            y2={stringY(s)}
            className="tab-string"
          />
        ))}
        {["e", "B", "G", "D", "A", "E"].map((label, i) => (
          <text key={label + i} x={LEFT_PAD - 38} y={stringY(i + 1) + 4} className="tab-string-label">
            {label}
          </text>
        ))}

        {/* notes */}
        {notes.map((n) => {
          const isCurrent =
            playheadBeat !== null &&
            playheadBeat >= n.startBeat &&
            playheadBeat < n.startBeat + n.duration;
          const result = results?.[n.index];
          const marker = MARKER_LABEL[n.technique_marker];
          const cls = [
            "tab-note",
            isCurrent ? "current" : "",
            result && result !== "pending" ? `result-${result}` : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <g key={n.index}>
              {marker && (
                <text x={beatX(n.startBeat)} y={stringY(n.string) - 10} className="tab-marker">
                  {marker}
                </text>
              )}
              <text x={beatX(n.startBeat)} y={stringY(n.string) + 4} className={cls}>
                {n.fret}
              </text>
            </g>
          );
        })}

        {/* playhead */}
        {playheadBeat !== null && playheadBeat >= 0 && (
          <line
            x1={beatX(playheadBeat)}
            x2={beatX(playheadBeat)}
            y1={TOP_PAD - 14}
            y2={stringY(6) + 14}
            className="tab-playhead"
          />
        )}
      </svg>
    </div>
  );
}

export { PX_PER_BEAT, BEATS_PER_MEASURE };
