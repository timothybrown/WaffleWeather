import uPlot from "uplot";

// ── Types ──────────────────────────────────────────────────────

export interface ResolvedColors {
  border: string;
  textFaint: string;
  surfaceAlt: string;
  primary: string;
  warning: string;
}

type TickFormatter = (timestamp: number) => string;

// ── Common ─────────────────────────────────────────────────────

function commonAxes(
  colors: ResolvedColors,
  tickFmt: TickFormatter,
  fontSize = 11,
): uPlot.Axis[] {
  return [
    {
      stroke: colors.textFaint,
      grid: { stroke: colors.border, dash: [3, 3], width: 1 },
      ticks: { stroke: colors.border, width: 1 },
      font: `${fontSize}px sans-serif`,
      values: (_u, splits) => splits.map(tickFmt),
    },
    {
      stroke: colors.textFaint,
      grid: { stroke: colors.border, dash: [3, 3], width: 1 },
      ticks: { stroke: colors.border, width: 1 },
      font: `${fontSize}px sans-serif`,
    },
  ];
}

function baseOpts(
  colors: ResolvedColors,
  tickFmt: TickFormatter,
  fontSize?: number,
): Partial<uPlot.Options> {
  return {
    axes: commonAxes(colors, tickFmt, fontSize),
    legend: { show: false },
    padding: [8, 8, 0, 0],
  };
}

const spline = uPlot.paths.spline!();

// ── History charts ─────────────────────────────────────────────

export function temperatureOpts(
  colors: ResolvedColors,
  tickFmt: TickFormatter,
  isRaw: boolean,
): Omit<uPlot.Options, "width" | "height"> {
  return {
    ...baseOpts(colors, tickFmt),
    series: [
      {}, // x-axis placeholder
      {
        label: "Max",
        stroke: "#d47272",
        fill: "rgba(212, 114, 114, 0.15)",
        paths: spline,
        show: !isRaw,
      },
      {
        label: "Avg",
        stroke: "#d4a574",
        fill: "rgba(212, 165, 116, 0.25)",
        paths: spline,
      },
      {
        label: "Min",
        stroke: "#7aaccc",
        fill: "rgba(122, 172, 204, 0.15)",
        paths: spline,
        show: !isRaw,
      },
    ],
    bands: isRaw
      ? []
      : [{ series: [1, 3] as uPlot.Band.Bounds, fill: "rgba(212, 165, 116, 0.08)" }],
  } as uPlot.Options;
}

export function humidityOpts(
  colors: ResolvedColors,
  tickFmt: TickFormatter,
): Omit<uPlot.Options, "width" | "height"> {
  return {
    ...baseOpts(colors, tickFmt),
    scales: { y: { range: [0, 100] as uPlot.Range.MinMax } },
    series: [
      {},
      {
        label: "Humidity",
        stroke: "#5eada5",
        width: 2,
        paths: spline,
      },
    ],
  } as uPlot.Options;
}

export function pressureOpts(
  colors: ResolvedColors,
  tickFmt: TickFormatter,
): Omit<uPlot.Options, "width" | "height"> {
  return {
    ...baseOpts(colors, tickFmt),
    series: [
      {},
      {
        label: "Pressure",
        stroke: "#a07cc0",
        width: 2,
        paths: spline,
        value: (_u: uPlot, v: number | null) => v != null ? v.toFixed(2) : "--",
      },
    ],
  } as uPlot.Options;
}

export function windOpts(
  colors: ResolvedColors,
  tickFmt: TickFormatter,
): Omit<uPlot.Options, "width" | "height"> {
  return {
    ...baseOpts(colors, tickFmt),
    series: [
      {},
      {
        label: "Speed",
        stroke: "#6aae7a",
        width: 2,
        paths: spline,
      },
      {
        label: "Gust",
        stroke: "#dba060",
        width: 2,
        dash: [4, 2],
        paths: spline,
      },
    ],
  } as uPlot.Options;
}

/**
 * Bucketed Wind opts: Speed as bars, Gust as a thin stepped line.
 *
 * - Bars use `align: 1` so they occupy `[tStart, tEnd)` from each row's time.
 * - Gust line uses `paths.stepped({ align: 1 })` for the same half-open
 *   semantic — values hold from x to the next x. This pairs with the
 *   bucketer outputting `time = tStart`.
 * - Gust is rendered with dashed stroke at 0.7 opacity so two filled/colored
 *   series don't visually fight when both are visible.
 *
 * Bars use `size: [barFactor, maxWidth]` where `barFactor` is the fraction
 * of the available slot to fill (0.95 = ~5% gap) and `maxWidth` is the
 * pixel cap (100px, matching `rainOpts`).
 */
export function windOptsBucketed(
  colors: ResolvedColors,
  tickFmt: TickFormatter,
): Omit<uPlot.Options, "width" | "height"> {
  const bars = uPlot.paths.bars!({ size: [0.95, 100], align: 1 });
  const stepped = uPlot.paths.stepped!({ align: 1 });
  return {
    ...baseOpts(colors, tickFmt),
    series: [
      {},
      {
        label: "Speed",
        stroke: "#6aae7a",
        fill: "#6aae7a",
        paths: bars,
      },
      {
        label: "Gust",
        stroke: "rgba(219, 160, 96, 0.7)",
        width: 1.5,
        dash: [4, 2],
        paths: stepped,
      },
    ],
  } as uPlot.Options;
}

export function rainOpts(
  colors: ResolvedColors,
  tickFmt: TickFormatter,
  decimals = 1,
): Omit<uPlot.Options, "width" | "height"> {
  const bars = uPlot.paths.bars!({ size: [0.6, 100], radius: 3 });
  return {
    ...baseOpts(colors, tickFmt),
    series: [
      {},
      {
        label: "Rain",
        stroke: "#6a9ac4",
        fill: "#6a9ac4",
        paths: bars,
        value: (_u: uPlot, v: number | null) => v != null ? v.toFixed(decimals) : "--",
      },
    ],
  } as uPlot.Options;
}

export function solarUvOpts(
  colors: ResolvedColors,
  tickFmt: TickFormatter,
): Omit<uPlot.Options, "width" | "height"> {
  const axes = commonAxes(colors, tickFmt);
  // Add right-side UV axis
  axes.push({
    stroke: colors.textFaint,
    grid: { show: false },
    ticks: { stroke: colors.border, width: 1 },
    font: "11px sans-serif",
    scale: "uv",
    side: 1,
  });

  return {
    ...baseOpts(colors, tickFmt),
    axes,
    scales: {
      uv: { auto: true },
    },
    series: [
      {},
      {
        label: "Solar",
        stroke: "#d4a574",
        fill: "rgba(212, 165, 116, 0.25)",
        paths: spline,
        scale: "y",
      },
      {
        label: "UV",
        stroke: "#d47272",
        fill: "rgba(212, 114, 114, 0.15)",
        paths: spline,
        scale: "uv",
      },
    ],
  } as uPlot.Options;
}

/**
 * Bucketed Solar/UV opts: Solar as amber bars (no fill underline), UV stays
 * as a stepped line on the right axis. Both use `align: 1` to match the
 * bucketer's `time = tStart` convention.
 */
export function solarUvOptsBucketed(
  colors: ResolvedColors,
  tickFmt: TickFormatter,
): Omit<uPlot.Options, "width" | "height"> {
  const axes = commonAxes(colors, tickFmt);
  axes.push({
    stroke: colors.textFaint,
    grid: { show: false },
    ticks: { stroke: colors.border, width: 1 },
    font: "11px sans-serif",
    scale: "uv",
    side: 1,
  });
  const bars = uPlot.paths.bars!({ size: [0.95, 100], align: 1 });
  const stepped = uPlot.paths.stepped!({ align: 1 });
  return {
    ...baseOpts(colors, tickFmt),
    axes,
    scales: { uv: { auto: true } },
    series: [
      {},
      {
        label: "Solar",
        stroke: "#d4a574",
        fill: "#d4a574",
        paths: bars,
        scale: "y",
      },
      {
        label: "UV",
        stroke: "#d47272",
        width: 1.5,
        paths: stepped,
        scale: "uv",
      },
    ],
  } as uPlot.Options;
}

// ── Lightning charts ───────────────────────────────────────────

export function strikeActivityOpts(
  colors: ResolvedColors,
  tickFmt: TickFormatter,
): Omit<uPlot.Options, "width" | "height"> {
  const bars = uPlot.paths.bars!({ size: [0.6, 100], radius: 2 });
  return {
    ...baseOpts(colors, tickFmt, 10),
    series: [
      {},
      {
        label: "Strikes",
        stroke: colors.warning,
        fill: colors.warning,
        paths: bars,
      },
    ],
  } as uPlot.Options;
}

export function stormDistanceOpts(
  colors: ResolvedColors,
  tickFmt: TickFormatter,
): Omit<uPlot.Options, "width" | "height"> {
  return {
    ...baseOpts(colors, tickFmt, 10),
    series: [
      {},
      {
        label: "Distance",
        stroke: colors.primary,
        width: 2,
        paths: spline,
        points: { show: true, size: 4 },
      },
    ],
  } as uPlot.Options;
}

// ── Series metadata for legend chips ───────────────────────────

export interface SeriesMeta {
  label: string;
  color: string;
  dashed?: boolean;
}

/** Returns metadata in the same order as the corresponding *Opts() series array
 *  (excluding the x-axis placeholder at index 0). Used to populate <ChartLegend>. */

export function temperatureSeriesMeta(): SeriesMeta[] {
  return [
    { label: "Max", color: "#d47272" },
    { label: "Avg", color: "#d4a574" },
    { label: "Min", color: "#7aaccc" },
  ];
}

export function humiditySeriesMeta(): SeriesMeta[] {
  return [{ label: "Humidity", color: "#5eada5" }];
}

export function pressureSeriesMeta(): SeriesMeta[] {
  return [{ label: "Pressure", color: "#a07cc0" }];
}

export function windSeriesMeta(): SeriesMeta[] {
  return [
    { label: "Speed", color: "#6aae7a" },
    { label: "Gust", color: "#dba060", dashed: true },
  ];
}

export function rainSeriesMeta(): SeriesMeta[] {
  return [{ label: "Rain", color: "#6a9ac4" }];
}

export function solarUvSeriesMeta(): SeriesMeta[] {
  return [
    { label: "Solar", color: "#d4a574" },
    { label: "UV", color: "#d47272" },
  ];
}

/** Returns the default visibility array for the Temperature chart based on
 *  resolution. Mirrors the `show: !isRaw` flags in temperatureOpts(). */
export function temperatureDefaultVisibility(isRaw: boolean): boolean[] {
  // Order matches temperatureSeriesMeta(): [Max, Avg, Min]
  return [!isRaw, true, !isRaw];
}
