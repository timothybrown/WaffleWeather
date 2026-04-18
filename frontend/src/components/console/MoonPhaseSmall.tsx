"use client";

/**
 * Compact 32x32 amber moon phase SVG.
 * Algorithm adapted from MoonCard.tsx.
 */

interface MoonPhaseSmallProps {
  phase: number; // 0 = new, 0.5 = full
}

export default function MoonPhaseSmall({ phase }: MoonPhaseSmallProps) {
  const R = 12;
  const CX = 16;
  const CY = 16;
  const top = `${CX},${CY - R}`;
  const bottom = `${CX},${CY + R}`;

  const sweepFraction = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
  const terminatorRx = R * Math.abs(1 - sweepFraction * 2);
  const isWaxing = phase <= 0.5;

  let litPath = "";

  if (phase >= 0.01 && phase <= 0.99) {
    if (phase > 0.49 && phase < 0.51) {
      litPath = `M${CX},${CY - R} A${R},${R} 0 1,1 ${CX},${CY + R} A${R},${R} 0 1,1 ${CX},${CY - R} Z`;
    } else {
      const outerSweep = isWaxing ? 0 : 1;
      const terminatorSweep = sweepFraction > 0.5 ? (isWaxing ? 1 : 0) : (isWaxing ? 0 : 1);
      litPath = [
        `M${top}`,
        `A${R},${R} 0 0,${outerSweep} ${bottom}`,
        `A${terminatorRx},${R} 0 0,${terminatorSweep} ${top}`,
        "Z",
      ].join(" ");
    }
  }

  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6 vfd-svg-glow" aria-hidden="true">
      <circle cx={CX} cy={CY} r={R} fill="#d4a574" />
      {litPath && <path d={litPath} fill="rgba(10, 8, 6, 0.85)" />}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(212, 165, 116, 0.2)" strokeWidth="0.5" />
    </svg>
  );
}
