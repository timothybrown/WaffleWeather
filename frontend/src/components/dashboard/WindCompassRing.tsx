"use client";

import { useRef, useEffect } from "react";
import { ParticleDrift } from "./particleDrift";

const C = 100;
const R = 78;
const CLIP_R = 58;
const RAD = Math.PI / 180;
const ARROW_TIP_R = 60;
const ARROW_HW = 5.5 * RAD;
const LABEL_R = 89;

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);
const CARDINALS: [number, string][] = [
  [0, "N"],
  [90, "E"],
  [180, "S"],
  [270, "W"],
];

function tickLine(deg: number) {
  const r = deg * RAD;
  const isCrd = deg % 90 === 0;
  const isInt = deg % 45 === 0 && !isCrd;
  const inner = isCrd ? 63 : isInt ? 68 : 73;
  return {
    x1: C + inner * Math.sin(r),
    y1: C - inner * Math.cos(r),
    x2: C + R * Math.sin(r),
    y2: C - R * Math.cos(r),
  };
}

function arrowPoints(dir: number): string {
  const r = dir * RAD;
  return [
    `${C + ARROW_TIP_R * Math.sin(r)},${C - ARROW_TIP_R * Math.cos(r)}`,
    `${C + R * Math.sin(r - ARROW_HW)},${C - R * Math.cos(r - ARROW_HW)}`,
    `${C + R * Math.sin(r + ARROW_HW)},${C - R * Math.cos(r + ARROW_HW)}`,
  ].join(" ");
}

function parseColor(cssColor: string): [number, number, number] {
  const m = cssColor.match(/\d+/g);
  if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
  return [168, 152, 136];
}

interface WindCompassRingProps {
  windDir: number | null | undefined;
  windSpeed: number | null | undefined;
  windGust: number | null | undefined;
}

function useParticleDrift(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  windSpeed: number | null | undefined,
  windGust: number | null | undefined,
  windDir: number | null | undefined,
) {
  const windRef = useRef({ speed: windSpeed, gust: windGust, dir: windDir });

  useEffect(() => {
    windRef.current = { speed: windSpeed, gust: windGust, dir: windDir };
  }, [windSpeed, windGust, windDir]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drift = new ParticleDrift();
    let colorRgb: [number, number, number] = [168, 152, 136];
    let lastTime = 0;

    const readColor = () => {
      const style = getComputedStyle(container);
      colorRgb = parseColor(style.getPropertyValue("color"));
    };
    readColor();

    const observer = new MutationObserver(readColor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    let rafId = 0;

    const loop = (now: number) => {
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
      lastTime = now;

      const { speed, gust, dir } = windRef.current;
      const hasData = speed != null && dir != null && speed > 0;

      if (hasData) {
        drift.update(dt, speed!, gust ?? null, dir!, now);
      } else {
        drift.clear();
      }

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const target = Math.round(w * dpr);
      if (canvas.width !== target) {
        canvas.width = target;
        canvas.height = target;
      }

      const scale = w / 200;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, w);

      if (drift.particles.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(C * scale, C * scale, CLIP_R * scale, 0, Math.PI * 2);
        ctx.clip();

        const [cr, cg, cb] = colorRgb;
        for (const p of drift.particles) {
          if (p.opacity <= 0.01) continue;
          ctx.beginPath();
          ctx.arc(
            p.x * scale,
            p.y * scale,
            p.size * scale,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${p.opacity.toFixed(3)})`;
          ctx.fill();
        }

        ctx.restore();
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default function WindCompassRing({
  windDir,
  windSpeed,
  windGust,
}: WindCompassRingProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showArrow = windDir != null && windSpeed != null;

  useParticleDrift(canvasRef, containerRef, windSpeed, windGust, windDir);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ color: "var(--color-text-muted)" }}
    >
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <circle
          cx={C}
          cy={C}
          r={CLIP_R}
          fill="var(--color-surface-hover)"
        />
        <circle
          cx={C}
          cy={C}
          r={R}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={0.5}
        />

        {TICKS.map((deg) => {
          const isCrd = deg % 90 === 0;
          const isInt = deg % 45 === 0 && !isCrd;
          const t = tickLine(deg);
          return (
            <line
              key={deg}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={
                isCrd
                  ? "var(--color-text)"
                  : isInt
                    ? "var(--color-text-muted)"
                    : "var(--color-text-faint)"
              }
              strokeWidth={isCrd ? 2 : isInt ? 1.5 : 0.75}
              strokeLinecap="round"
            />
          );
        })}

        {CARDINALS.map(([deg, label]) => {
          const r = deg * RAD;
          return (
            <text
              key={label}
              x={C + LABEL_R * Math.sin(r)}
              y={C - LABEL_R * Math.cos(r)}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--color-text)"
              fontSize={12}
              fontWeight={700}
            >
              {label}
            </text>
          );
        })}

        {showArrow && (
          <polygon
            points={arrowPoints(windDir!)}
            fill="var(--color-primary)"
          />
        )}
      </svg>

      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  );
}
