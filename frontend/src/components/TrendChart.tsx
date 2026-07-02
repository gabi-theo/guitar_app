import { useMemo, useRef, useState } from "react";

export interface TrendPoint {
  date: string; // ISO yyyy-mm-dd
  value: number;
  detail?: string; // extra tooltip line, e.g. "4 attempts"
}

interface Props {
  points: TrendPoint[];
  height?: number;
  formatValue: (v: number) => string;
}

const M = { top: 16, right: 20, bottom: 26, left: 46 };

function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.5; v += step) ticks.push(v);
  return ticks;
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Single-series trend: 2px line, 10%-opacity area wash, hairline grid,
 * crosshair snapping to the nearest day with a tooltip. One y-axis.
 */
export default function TrendChart({ points, height = 240, formatValue }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const width = 720; // viewBox width; scales responsively via CSS

  const { xs, ys, ticks, path, area } = useMemo(() => {
    const innerW = width - M.left - M.right;
    const innerH = height - M.top - M.bottom;
    const max = Math.max(...points.map((p) => p.value), 0);
    const tickVals = niceTicks(max);
    const yMax = tickVals[tickVals.length - 1] || 1;
    const n = points.length;
    const xAt = (i: number) => M.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yAt = (v: number) => M.top + innerH - (v / yMax) * innerH;
    const xsArr = points.map((_, i) => xAt(i));
    const ysArr = points.map((p) => yAt(p.value));
    const d = points.map((_, i) => `${i === 0 ? "M" : "L"}${xsArr[i]},${ysArr[i]}`).join(" ");
    const baseline = M.top + innerH;
    const a =
      n > 1 ? `${d} L${xsArr[n - 1]},${baseline} L${xsArr[0]},${baseline} Z` : "";
    return {
      xs: xsArr,
      ys: ysArr,
      ticks: tickVals.map((v) => ({ v, y: yAt(v) })),
      path: d,
      area: a,
    };
  }, [points, height]);

  if (points.length === 0) {
    return <div className="chart-empty muted">No attempts in this range yet.</div>;
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    setHover(best);
  };

  const h = hover !== null ? points[hover] : null;
  const innerH = height - M.top - M.bottom;

  // x labels: first, last, and up to 3 between, skipping collisions
  const labelIdx = new Set<number>();
  const nLabels = Math.min(5, points.length);
  for (let k = 0; k < nLabels; k++) {
    labelIdx.add(Math.round((k / Math.max(1, nLabels - 1)) * (points.length - 1)));
  }

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="trend-chart"
        role="img"
        aria-label="Progress over time"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map(({ v, y }) => (
          <g key={v}>
            <line className="chart-grid" x1={M.left} x2={width - M.right} y1={y} y2={y} />
            <text className="chart-tick" x={M.left - 8} y={y + 4} textAnchor="end">
              {formatValue(v)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          labelIdx.has(i) ? (
            <text key={p.date} className="chart-tick" x={xs[i]} y={M.top + innerH + 18} textAnchor="middle">
              {shortDate(p.date)}
            </text>
          ) : null,
        )}
        {area && <path d={area} className="chart-area" />}
        <path d={path} className="chart-line" fill="none" />
        {/* end marker with surface ring */}
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={6} className="chart-dot-ring" />
        <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={4} className="chart-dot" />
        {h && hover !== null && (
          <g>
            <line className="chart-crosshair" x1={xs[hover]} x2={xs[hover]} y1={M.top} y2={M.top + innerH} />
            <circle cx={xs[hover]} cy={ys[hover]} r={6} className="chart-dot-ring" />
            <circle cx={xs[hover]} cy={ys[hover]} r={4} className="chart-dot" />
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(xs[hover] / width) * 100}%`,
            transform: `translateX(${xs[hover] > width * 0.7 ? "-108%" : "8px"})`,
          }}
        >
          <strong>{formatValue(h.value)}</strong>
          <span>{shortDate(h.date)}</span>
          {h.detail && <span>{h.detail}</span>}
        </div>
      )}
    </div>
  );
}
