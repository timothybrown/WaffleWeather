"use client";

import { useEffect, useRef, useCallback } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

interface UPlotChartProps {
  options: Omit<uPlot.Options, "width" | "height">;
  data: uPlot.AlignedData;
  syncKey?: string;
  onZoom?: (min: number, max: number) => void;
  className?: string;
}

function fmtVal(v: number): string {
  if (v % 1 === 0) return v.toString();
  return v.toFixed(1);
}

function tooltipPlugin(seriesValueFns: Set<number>): uPlot.Plugin {
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
    const date = new Date(ts * 1000);
    const timeStr = date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

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
      rowData.push({
        color: String(color ?? ""),
        label: String(s.label ?? ""),
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

export default function UPlotChart({
  options,
  data,
  syncKey,
  onZoom,
  className,
}: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  // Hold latest data in a ref so chart creation uses fresh data without
  // making `data` a dependency of `createChart`. Data updates flow through
  // the dedicated `setData` effect below, avoiding destroy/recreate on every
  // WebSocket tick.
  //
  // Assign during render (not in useEffect) so a newly-mounted uPlot instance
  // sees the CURRENT render's data rather than the previous one. React
  // officially supports ref mutation during render for this cache-latest-value
  // pattern; the assignment is idempotent across re-renders.
  const dataRef = useRef(data);
  dataRef.current = data;

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
