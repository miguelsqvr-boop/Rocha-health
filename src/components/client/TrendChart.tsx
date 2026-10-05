"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatDate, formatMonthYear } from "@/lib/format";

export interface TrendPoint {
  date: string; // YYYY-MM-DD or ISO
  value: number;
  flag?: string | null;
}

interface Props {
  title: string;
  unit: string | null;
  points: TrendPoint[];
  low?: number | null;
  high?: number | null;
  height?: number;
}

const toTime = (d: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00Z` : d).getTime();

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toPrecision(10)));
  return ticks;
}

/**
 * One person's values for one measure over time. Single series, so no legend:
 * the title names it. The lab's reference range is a background band; points
 * outside it are marked and labelled in the tooltip (never colour alone).
 * Every value is also in the table under the chart.
 */
export function TrendChart({ title, unit, points, low = null, high = null, height = 200 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const data = useMemo(() => [...points].sort((a, b) => toTime(a.date) - toTime(b.date)), [points]);
  const pad = { top: 12, right: 16, bottom: 26, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const values = data.map((p) => p.value);
  const domainValues = [...values, ...(low !== null ? [low] : []), ...(high !== null ? [high] : [])];
  let yMin = Math.min(...domainValues);
  let yMax = Math.max(...domainValues);
  const span = yMax - yMin || Math.abs(yMax) || 1;
  yMin -= span * 0.12;
  yMax += span * 0.12;
  if (Math.min(...values) >= 0 && yMin < 0) yMin = 0;

  const tMin = toTime(data[0]?.date ?? new Date().toISOString());
  const tMax = toTime(data.at(-1)?.date ?? new Date().toISOString());
  const x = (d: string) => (tMax === tMin ? innerW / 2 : ((toTime(d) - tMin) / (tMax - tMin)) * innerW);
  const y = (v: number) => innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const yTicks = niceTicks(yMin, yMax);
  const xTicks = data.length <= 4 ? data.map((d) => d.date) : [data[0].date, data[Math.floor(data.length / 2)].date, data.at(-1)!.date];
  const path = data.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const outOfRange = (v: number) => (low !== null && v < low) || (high !== null && v > high);

  function onMove(event: React.PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    let best = 0;
    data.forEach((p, i) => { if (Math.abs(x(p.date) - px) < Math.abs(x(data[best].date) - px)) best = i; });
    setHover(best);
  }

  const active = hover !== null ? data[hover] : null;
  const unitText = unit ? ` ${unit}` : "";

  return (
    <figure className="m-0">
      <figcaption id={titleId} className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{title}{unit && <span className="font-normal text-ink-2"> · {unit}</span>}</span>
        {(low !== null || high !== null) && (
          <span className="flex items-center gap-1 text-xs text-ink-2">
            <span aria-hidden className="inline-block h-2.5 w-4 rounded-sm" style={{ background: "var(--band)" }} />
            Reference range
          </span>
        )}
      </figcaption>
      <div ref={wrapRef} className="relative">
        <svg width={width} height={height} role="img" aria-labelledby={titleId} className="block max-w-full">
          <g transform={`translate(${pad.left},${pad.top})`}>
            {(low !== null || high !== null) && (
              <rect x={0} width={innerW} y={y(high ?? yMax)} height={Math.max(0, y(low ?? yMin) - y(high ?? yMax))} fill="var(--band)" />
            )}
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular">{t}</text>
              </g>
            ))}
            {xTicks.map((d, i) => (
              <text key={`${d}-${i}`} x={x(d)} y={innerH + 18} textAnchor={xTicks.length === 1 ? "middle" : i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} fontSize={11} fill="var(--muted)">
                {formatMonthYear(d)}
              </text>
            ))}
            {data.length > 1 && <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            {active && <line x1={x(active.date)} x2={x(active.date)} y1={0} y2={innerH} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />}
            {data.map((p, i) => {
              const flagged = outOfRange(p.value);
              return (
                <circle
                  key={`${p.date}-${i}`}
                  cx={x(p.date)}
                  cy={y(p.value)}
                  r={hover === i ? 6 : 4.5}
                  fill={flagged ? "var(--serious)" : "var(--series-1)"}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              );
            })}
            <rect
              x={0} y={0} width={innerW} height={innerH} fill="transparent"
              onPointerMove={onMove} onPointerLeave={() => setHover(null)}
              tabIndex={0}
              onFocus={() => setHover(data.length - 1)}
              onBlur={() => setHover(null)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? data.length) - 1));
                if (e.key === "ArrowRight") setHover((h) => Math.min(data.length - 1, (h ?? -1) + 1));
              }}
              aria-label={`${title} values; use arrow keys to move between dates`}
            />
          </g>
        </svg>
        {active && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm"
            style={{
              left: Math.min(Math.max(pad.left + x(active.date) - 70, 0), width - 150),
              top: Math.max(0, pad.top + y(active.value) - 64),
            }}
          >
            <p className="text-sm font-semibold text-ink tabular">{active.value}{unitText}</p>
            <p className="text-ink-2">{formatDate(active.date)}</p>
            {outOfRange(active.value) && <p className="text-serious-ink">{low !== null && active.value < low ? "▼ Below" : "▲ Above"} reference range</p>}
          </div>
        )}
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-ink-2">Show values as a table</summary>
        <table className="mt-1 text-xs">
          <tbody>
            {[...data].reverse().map((p, i) => (
              <tr key={i}>
                <td className="pr-4 text-ink-2">{formatDate(p.date)}</td>
                <td className="pr-2 text-ink tabular">{p.value}{unitText}</td>
                <td className="text-serious-ink">{outOfRange(p.value) ? (low !== null && p.value < low ? "Low" : "High") : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
