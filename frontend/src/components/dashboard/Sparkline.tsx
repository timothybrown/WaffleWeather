"use client";

import { memo, useId, useMemo } from "react";

interface SparklineProps {
  data: (number | null)[];
  color: string;
  label?: string;
  height?: number;
}

const VIEW_W = 200;

function monotoneCubicPath(
  points: { x: number; y: number }[],
): string {
  if (points.length < 2) return "";

  const n = points.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    dy.push(points[i + 1].y - points[i].y);
    m.push(dy[i] / dx[i]);
  }

  const tangents: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      tangents.push(0);
    } else {
      tangents.push((m[i - 1] + m[i]) / 2);
    }
  }
  tangents.push(m[n - 2]);

  // Fritsch-Carlson monotonicity
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-10) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i] / m[i];
      const beta = tangents[i + 1] / m[i];
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        tangents[i] = t * alpha * m[i];
        tangents[i + 1] = t * beta * m[i];
      }
    }
  }

  let path = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const d = dx[i] / 3;
    const cp1x = points[i].x + d;
    const cp1y = points[i].y + d * tangents[i];
    const cp2x = points[i + 1].x - d;
    const cp2y = points[i + 1].y - d * tangents[i + 1];
    path += `C${cp1x},${cp1y},${cp2x},${cp2y},${points[i + 1].x},${points[i + 1].y}`;
  }

  return path;
}

function Sparkline({ data, color, label, height = 32 }: SparklineProps) {
  const gradientId = useId();
  const pathData = useMemo(() => {
    const valid = data
      .map((v, i) => (v != null ? { index: i, value: v } : null))
      .filter((d): d is { index: number; value: number } => d != null);

    if (valid.length < 2) return null;

    const minVal = Math.min(...valid.map((d) => d.value));
    const maxVal = Math.max(...valid.map((d) => d.value));
    const range = maxVal - minVal || 1;
    const pad = range * 0.1;

    const points = valid.map((d) => ({
      x: (d.index / (data.length - 1)) * VIEW_W,
      y: height - ((d.value - minVal + pad) / (range + 2 * pad)) * height,
    }));

    const line = monotoneCubicPath(points);
    const area =
      line +
      `L${points[points.length - 1].x},${height}` +
      `L${points[0].x},${height}Z`;

    return { line, area };
  }, [data, height]);

  if (!pathData) return null;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      className="h-8 w-full"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={pathData.area} fill={`url(#${gradientId})`} />
      <path
        d={pathData.line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default memo(Sparkline);
