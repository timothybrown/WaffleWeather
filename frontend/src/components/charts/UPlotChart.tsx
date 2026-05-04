"use client";

import { useEffect, useRef, useCallback } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { BucketMeta } from "@/lib/adaptive-bucket";

interface UPlotChartProps {
  options: Omit<uPlot.Options, "width" | "height">;
  data: uPlot.AlignedData;
  syncKey?: string;
  onZoom?: (min: number, max: number) => void;
  className?: string;
  /** Visibility per non-x series. Length = options.series.length - 1.
   *  Index 0 here corresponds to options.series[1], etc. */
  seriesVisibility?: boolean[];
  /** Optional per-row bucket boundaries. When present, tooltip header shows
   *  the interval [tStart, tEnd) instead of a single instant. */
  bucketMeta?: BucketMeta[];
  /** Optional per-non-x-series labels overriding `options.series[i].label`
   *  in the tooltip. Length matches `seriesVisibility`. Used to surface
   *  aggregation semantics (e.g. "Avg Speed", "Peak Gust"). */
  aggregationLabels?: string[];
}

function fmtVal(v: number): string {
  if (v % 1 === 0) return v.toString();
  return v.toFixed(1);
}

function tooltipPlugin(
  seriesValueFns: Set<number>,
  bucketMetaRef: React.RefObject<BucketMeta[] | undefined>,
  aggLabelsRef: React.RefObject<string[] | undefined>,
): uPlot.Plugin {
  let tooltip: HTMLDivElement;

  function init(u: uPlot) {
    tooltip = document.createElement("div");
    tooltip.className = "uplot-tooltip";
    tooltip.style.display = "none";
    u.over.appendChild(tooltip);
  }

  function setCursor(u: uPlot) {
    const idx = u.cursor.idx;
    if (idx == null || idx < 0) {
      tooltip.style.display = "none";
      return;
    }

    const ts = u.data[0][idx];
    const meta = bucketMetaRef.current?.[idx];
    let timeStr: string;
    if (meta) {
      const dStart = new Date(meta.tStart * 1000);
      const dEnd = new Date(meta.tEnd * 1000);
      const datePart = dStart.toLocaleString([], {
        month: "short",
        day: "numeric",
      });
      const timeFmt: Intl.DateTimeFormatOptions = {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      };
      const startTime = dStart.toLocaleTimeString([], timeFmt);
      const endTime = dEnd.toLocaleTimeString([], timeFmt);
      timeStr = `${datePart}, ${startTime}–${endTime}`;
    } else {
      const date = new Date(ts * 1000);
      timeStr = date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    type Row = { color: string; label: string; display: string };
    const rowData: Row[] = [];
    for (let i = 1; i < u.series.length; i++) {
      const s = u.series[i];
      if (!s.show) continue;
      const val = (u.data[i] as (number | null)[])[idx];
      if (val == null) continue;
      const color =
        typeof s.stroke === "function" ? s.stroke(u, i) : s.stroke;
      const display = seriesValueFns.has(i) && typeof s.value === "function" ? s.value(u, val, i, idx) : fmtVal(val);
      const labelOverride = aggLabelsRef.current?.[i - 1];
      rowData.push({
        color: String(color ?? ""),
        label: String(labelOverride ?? s.label ?? ""),
        display: String(display),
      });
    }

    if (rowData.length === 0) {
      tooltip.style.display = "none";
      return;
    }

    // Clear existing content and rebuild via DOM API (defense in depth; avoids
    // any innerHTML code paths).
    tooltip.textContent = "";

    const timeEl = document.createElement("div");
    timeEl.className = "uplot-tooltip-time";
    timeEl.textContent = timeStr;
    tooltip.append(timeEl);

    for (const r of rowData) {
      const row = document.createElement("div");
      row.className = "uplot-tooltip-row";

      const dot = document.createElement("span");
      dot.className = "uplot-tooltip-dot";
      dot.style.background = r.color;

      const label = document.createElement("span");
      label.className = "uplot-tooltip-label";
      label.textContent = `${r.label}:`;

      const value = document.createElement("span");
      value.className = "uplot-tooltip-value";
      value.textContent = r.display;

      row.append(dot, label, value);
      tooltip.append(row);
    }

    tooltip.style.display = "block";

    // Position: follow cursor, flip near right edge
    const left = u.cursor.left!;
    const overWidth = u.over.clientWidth;
    const ttWidth = tooltip.offsetWidth;
    const x =
      left + ttWidth + 20 > overWidth ? left - ttWidth - 12 : left + 12;

    tooltip.style.left = `${Math.max(0, x)}px`;
    tooltip.style.top = "8px";
  }

  return {
    hooks: {
      init: [init],
      setCursor: [setCursor],
    },
  };
}

function applyBandsForVisibility(
  chart: uPlot,
  visibility: boolean[] | undefined,
): void {
  const mutableChart = chart as unknown as {
    __originalBands?: uPlot.Band[];
    bands: uPlot.Band[];
  };
  const original = mutableChart.__originalBands;
  if (!original) return;

  if (!visibility) {
    mutableChart.bands = original;
    chart.redraw();
    return;
  }

  // A band is "active" iff every series it references is visible.
  // uPlot band series indices are 1-based; visibility[i] corresponds to series[i+1].
  mutableChart.bands = original.filter((b) => {
    const bandSeriesIndices = Array.isArray(b.series) ? b.series : [];
    return bandSeriesIndices.every((sIdx: number) => {
      const visIdx = sIdx - 1;
      return visIdx < 0 || visIdx >= visibility.length || visibility[visIdx];
    });
  });
  chart.redraw();
}

export default function UPlotChart({
  options,
  data,
  syncKey,
  onZoom,
  className,
  seriesVisibility,
  bucketMeta,
  aggregationLabels,
}: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const onZoomRef = useRef(onZoom);
  useEffect(() => {
    onZoomRef.current = onZoom;
  }, [onZoom]);

  // Hold latest data in a ref so chart creation uses fresh data without
  // making `data` a dependency of `createChart`. Data updates flow through
  // the dedicated `setData` effect below, avoiding destroy/recreate on every
  // WebSocket tick.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Hold latest seriesVisibility in a ref so createChart can read the user's
  // current toggle state without making it a dependency (which would cause
  // unnecessary chart recreation on every visibility change).
  const visibilityRef = useRef(seriesVisibility);
  useEffect(() => {
    visibilityRef.current = seriesVisibility;
  }, [seriesVisibility]);

  // Hold latest bucketMeta / aggregationLabels in refs so the tooltip plugin
  // (created once per chart instance) reads fresh values on every cursor
  // movement without forcing chart recreation when these props change.
  const bucketMetaRef = useRef<BucketMeta[] | undefined>(bucketMeta);
  useEffect(() => {
    bucketMetaRef.current = bucketMeta;
  }, [bucketMeta]);

  const aggLabelsRef = useRef<string[] | undefined>(aggregationLabels);
  useEffect(() => {
    aggLabelsRef.current = aggregationLabels;
  }, [aggregationLabels]);

  const createChart = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    chartRef.current?.destroy();

    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width === 0 || height === 0) return;

    const opts: uPlot.Options = {
      ...options,
      width,
      height,
      plugins: [tooltipPlugin(
        new Set(
          (options.series ?? [])
            .map((s, i) => (s.value != null ? i : -1))
            .filter((i) => i >= 0),
        ),
        bucketMetaRef,
        aggLabelsRef,
      )],
      cursor: {
        ...options.cursor,
        drag: { x: true, y: false, setScale: false },
        sync: syncKey ? { key: syncKey, setSeries: true } : undefined,
      },
      hooks: {
        ...options.hooks,
        setSelect: [
          (u: uPlot) => {
            const left = u.select.left;
            const selWidth = u.select.width;
            if (selWidth < 2) return;
            const min = u.posToVal(left, "x");
            const max = u.posToVal(left + selWidth, "x");
            onZoomRef.current?.(min, max);
            u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
          },
        ],
      },
    };

    chartRef.current = new uPlot(opts, dataRef.current, el);

    // Capture the original bands so we can recompute the visible subset
    // each time visibility changes. Stored on the instance for simplicity.
    (chartRef.current as unknown as { __originalBands: uPlot.Band[] }).__originalBands =
      [...(opts.bands ?? [])] as uPlot.Band[];

    // Apply visibility to the freshly-created instance for EVERY series, not
    // just hidden ones. The new instance's series[i].show comes from
    // opts.series[i].show, which may be `false` (e.g. Temperature Max/Min in
    // raw 24h mode) — we must override it with the user's current toggle
    // state in either direction. setSeries is cheap and idempotent for
    // matching state, so calling it unconditionally is correct.
    const visibility = visibilityRef.current;
    if (visibility) {
      for (let i = 0; i < visibility.length; i++) {
        chartRef.current.setSeries(i + 1, { show: visibility[i] });
      }
    }
    applyBandsForVisibility(chartRef.current, visibility);
  }, [syncKey, options]);

  // Mount / options change → recreate chart.
  // NOTE: `data` is intentionally NOT a dependency — data updates flow through
  // setData below. Parent callers must memoize `options` to avoid churn.
  useEffect(() => {
    createChart();
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [createChart]);

  // Data-only updates — avoid full recreation
  const prevDataRef = useRef(data);
  useEffect(() => {
    if (data === prevDataRef.current) return;
    prevDataRef.current = data;
    if (chartRef.current) {
      chartRef.current.setData(data, true);
    }
  }, [data]);

  // Series visibility — apply imperatively when prop changes.
  // (Reapplication after chart recreation is handled in createChart effect — Task 5.)
  const prevVisibilityRef = useRef(seriesVisibility);
  useEffect(() => {
    if (seriesVisibility === prevVisibilityRef.current) return;
    const prev = prevVisibilityRef.current;
    prevVisibilityRef.current = seriesVisibility;

    const chart = chartRef.current;
    if (!chart) return;

    if (seriesVisibility) {
      for (let i = 0; i < seriesVisibility.length; i++) {
        if (!prev || prev[i] !== seriesVisibility[i]) {
          // uPlot series indices are 1-based (0 = x-axis)
          chart.setSeries(i + 1, { show: seriesVisibility[i] });
        }
      }
    }
    applyBandsForVisibility(chart, seriesVisibility);
  }, [seriesVisibility]);

  // Zoom: apply scale changes imperatively without recreating chart
  const xScaleObj = options.scales?.x as Record<string, unknown> | undefined;
  const xMin = xScaleObj?.min as number | undefined;
  const xMax = xScaleObj?.max as number | undefined;

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (xMin != null && xMax != null) {
      chart.setScale("x", { min: xMin, max: xMax });
    } else {
      // Reset to full data range
      const ts = chart.data?.[0];
      if (ts && ts.length > 0) {
        chart.setScale("x", {
          min: ts[0] as number,
          max: ts[ts.length - 1] as number,
        });
      }
    }
  }, [xMin, xMax]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timeout: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (chartRef.current && el.clientWidth > 0 && el.clientHeight > 0) {
          chartRef.current.setSize({
            width: el.clientWidth,
            height: el.clientHeight,
          });
        }
      }, 100);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timeout);
      ro.disconnect();
    };
  }, []);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />;
}
