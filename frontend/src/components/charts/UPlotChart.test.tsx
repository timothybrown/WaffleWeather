import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render } from "@testing-library/react";
import UPlotChart from "./UPlotChart";
import type uPlot from "uplot";

// Mock uPlot — Canvas is not available in happy-dom
const { destroyMock, setDataMock, setSeriesMock, redrawMock, UPlotConstructor } = vi.hoisted(() => {
  const destroyMock = vi.fn();
  const setSizeMock = vi.fn();
  const setDataMock = vi.fn();
  const setSeriesMock = vi.fn();
  const redrawMock = vi.fn();
  const UPlotConstructor = vi.fn(function (this: Record<string, unknown>) {
    this.destroy = destroyMock;
    this.setSize = setSizeMock;
    this.setData = setDataMock;
    this.setSeries = setSeriesMock;
    this.redraw = redrawMock;
    this.bands = []; // mutable; tests assert on this
  }) as unknown as Mock<(opts: uPlot.Options, data: uPlot.AlignedData, el: HTMLElement) => void>;
  return { destroyMock, setDataMock, setSeriesMock, redrawMock, UPlotConstructor };
});

vi.mock("uplot", () => ({
  default: UPlotConstructor,
  __esModule: true,
}));

// Give the container non-zero dimensions
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
});

const baseOpts: Omit<uPlot.Options, "width" | "height"> = {
  series: [{}, { label: "Test", stroke: "red" }],
};
const baseData: uPlot.AlignedData = [
  [1, 2, 3],
  [10, 20, 30],
];

describe("UPlotChart", () => {
  it("renders a container div", () => {
    const { container } = render(
      <UPlotChart options={baseOpts} data={baseData} />,
    );
    expect(container.firstChild).toBeInstanceOf(HTMLDivElement);
  });

  it("creates a uPlot instance on mount with dimensions", () => {
    render(<UPlotChart options={baseOpts} data={baseData} />);
    expect(UPlotConstructor).toHaveBeenCalledTimes(1);
    const opts = UPlotConstructor.mock.calls[0]?.[0] as uPlot.Options | undefined;
    expect(opts!.width).toBe(800);
    expect(opts!.height).toBe(200);
  });

  it("destroys the instance on unmount", () => {
    const { unmount } = render(
      <UPlotChart options={baseOpts} data={baseData} />,
    );
    unmount();
    expect(destroyMock).toHaveBeenCalled();
  });

  it("calls setData when data changes", () => {
    const { rerender } = render(
      <UPlotChart options={baseOpts} data={baseData} />,
    );
    const newData: uPlot.AlignedData = [
      [4, 5, 6],
      [40, 50, 60],
    ];
    rerender(<UPlotChart options={baseOpts} data={newData} />);
    expect(setDataMock).toHaveBeenCalledWith(newData, true);
  });

  it("configures drag-to-zoom on the x axis", () => {
    render(<UPlotChart options={baseOpts} data={baseData} />);
    const opts = UPlotConstructor.mock.calls[0]?.[0] as uPlot.Options | undefined;
    expect(opts!.cursor!.drag!.x).toBe(true);
    expect(opts!.cursor!.drag!.y).toBe(false);
  });

  it("sets cursor sync key when syncKey is provided", () => {
    render(
      <UPlotChart options={baseOpts} data={baseData} syncKey="test" />,
    );
    const opts = UPlotConstructor.mock.calls[0]?.[0] as uPlot.Options | undefined;
    expect(opts!.cursor!.sync!.key).toBe("test");
  });

  it("applies seriesVisibility via setSeries when the prop changes", () => {
    const optsTwo: Omit<uPlot.Options, "width" | "height"> = {
      series: [{}, { label: "A", stroke: "red" }, { label: "B", stroke: "blue" }],
    };
    const dataTwo: uPlot.AlignedData = [[1, 2], [10, 20], [11, 21]];

    const { rerender } = render(
      <UPlotChart options={optsTwo} data={dataTwo} seriesVisibility={[true, true]} />,
    );

    // No setSeries calls yet — initial state matches uPlot's series defaults
    setSeriesMock.mockClear();

    rerender(
      <UPlotChart options={optsTwo} data={dataTwo} seriesVisibility={[true, false]} />,
    );

    // Series indices in setSeries are 1-based (skip x-axis at 0)
    expect(setSeriesMock).toHaveBeenCalledWith(2, { show: false });
  });

  it("does not call setSeries when seriesVisibility prop is unchanged", () => {
    const optsTwo: Omit<uPlot.Options, "width" | "height"> = {
      series: [{}, { label: "A", stroke: "red" }, { label: "B", stroke: "blue" }],
    };
    const dataTwo: uPlot.AlignedData = [[1, 2], [10, 20], [11, 21]];

    const visibility = [true, false];
    const { rerender } = render(
      <UPlotChart options={optsTwo} data={dataTwo} seriesVisibility={visibility} />,
    );

    setSeriesMock.mockClear();
    rerender(
      <UPlotChart options={optsTwo} data={dataTwo} seriesVisibility={visibility} />,
    );

    expect(setSeriesMock).not.toHaveBeenCalled();
  });

  it("reapplies seriesVisibility after chart instance is recreated", () => {
    const optsA: Omit<uPlot.Options, "width" | "height"> = {
      series: [{}, { label: "A", stroke: "red" }, { label: "B", stroke: "blue" }],
    };
    const optsB: Omit<uPlot.Options, "width" | "height"> = {
      series: [{}, { label: "A", stroke: "red" }, { label: "B", stroke: "blue" }],
      // Different reference triggers recreation
    };
    const dataTwo: uPlot.AlignedData = [[1, 2], [10, 20], [11, 21]];

    const { rerender } = render(
      <UPlotChart
        options={optsA}
        data={dataTwo}
        seriesVisibility={[true, false]}
      />,
    );

    // After initial mount, setSeries should have been called for index 1 (=
    // hiding series B) as part of the post-creation reapplication
    expect(setSeriesMock).toHaveBeenCalledWith(2, { show: false });

    setSeriesMock.mockClear();

    // Force chart recreation by passing a fresh options reference
    rerender(
      <UPlotChart
        options={optsB}
        data={dataTwo}
        seriesVisibility={[true, false]}
      />,
    );

    // setSeries must be called again to re-hide B on the new chart instance
    expect(setSeriesMock).toHaveBeenCalledWith(2, { show: false });
  });

  it("reapplies seriesVisibility after recreation when options-default is hidden but user toggled visible", () => {
    // Mirrors the Temperature raw-24h scenario: options say series[1].show=false
    // (Max hidden by default), but the user toggled Max ON in the chip row, so
    // seriesVisibility[0] is true. After recreation, the new chart instance will
    // honor options.series[1].show=false unless we explicitly call setSeries to
    // re-show it. Without this fix, the chip says "Max" is on while the line
    // is invisible.
    const optsRaw: Omit<uPlot.Options, "width" | "height"> = {
      series: [
        {},
        { label: "Max", stroke: "red", show: false },
        { label: "Avg", stroke: "orange" },
        { label: "Min", stroke: "blue", show: false },
      ],
    };
    const optsRaw2: Omit<uPlot.Options, "width" | "height"> = {
      series: [
        {},
        { label: "Max", stroke: "red", show: false },
        { label: "Avg", stroke: "orange" },
        { label: "Min", stroke: "blue", show: false },
      ],
    };
    const tempData: uPlot.AlignedData = [[1, 2], [60, 65], [55, 58], [50, 52]];

    // User toggled Max ON; Min still off; Avg always on
    const visibility = [true, true, false];

    const { rerender } = render(
      <UPlotChart
        options={optsRaw}
        data={tempData}
        seriesVisibility={visibility}
      />,
    );

    // On initial mount, setSeries must restore Max to visible (overriding the
    // options-default of false)
    expect(setSeriesMock).toHaveBeenCalledWith(2, { show: true });

    setSeriesMock.mockClear();

    // Force recreation
    rerender(
      <UPlotChart
        options={optsRaw2}
        data={tempData}
        seriesVisibility={visibility}
      />,
    );

    // Must reassert the user's "Max ON" preference against the options-default
    expect(setSeriesMock).toHaveBeenCalledWith(2, { show: true });
  });

  it("filters out bands whose bounding series are hidden", () => {
    const tempOpts: Omit<uPlot.Options, "width" | "height"> = {
      series: [
        {},
        { label: "Max", stroke: "red" },
        { label: "Avg", stroke: "orange" },
        { label: "Min", stroke: "blue" },
      ],
      bands: [{ series: [1, 3], fill: "rgba(0,0,0,0.1)" }],
    };
    const tempData: uPlot.AlignedData = [
      [1, 2],
      [60, 65],
      [55, 58],
      [50, 52],
    ];

    // Hide Min (series index 3 in uPlot, index 2 in seriesVisibility)
    const { rerender } = render(
      <UPlotChart
        options={tempOpts}
        data={tempData}
        seriesVisibility={[true, true, true]}
      />,
    );

    // Access the constructed uPlot instance via Vitest's mock.instances API
    const inst = UPlotConstructor.mock.instances[0] as unknown as { bands: unknown[] };
    expect(inst.bands).toHaveLength(1); // all visible → band kept

    rerender(
      <UPlotChart
        options={tempOpts}
        data={tempData}
        seriesVisibility={[true, true, false]}
      />,
    );

    expect(inst.bands).toHaveLength(0); // Min hidden → band filtered out
    expect(redrawMock).toHaveBeenCalled();

    // Restore Min — band returns
    rerender(
      <UPlotChart
        options={tempOpts}
        data={tempData}
        seriesVisibility={[true, true, true]}
      />,
    );

    expect(inst.bands).toHaveLength(1);
  });

  // Build a fake uPlot instance the tooltip plugin can drive against.
  // Only the surface tooltipPlugin reads is provided.
  //
  // The plugin skips any series where `!s.show`; uPlot defaults non-x series
  // to visible at construction time, but `opts.series` as authored has
  // `show: undefined` (which is falsy). We force `show: true` for non-x
  // series in the fake so the plugin doesn't skip every row.
  function makeFakeUPlot(opts: uPlot.Options, data: uPlot.AlignedData) {
    const over = document.createElement("div");
    Object.defineProperty(over, "clientWidth", { value: 600, configurable: true });
    return {
      over,
      cursor: { idx: null as number | null, left: 100 },
      data,
      series: (opts.series ?? []).map((s, i) =>
        i === 0 ? s : { ...s, show: s.show ?? true },
      ),
    };
  }

  function getTooltipPlugin(): uPlot.Plugin {
    const opts = UPlotConstructor.mock.calls[0]?.[0] as uPlot.Options;
    const plugin = opts.plugins?.[0];
    if (!plugin) throw new Error("tooltip plugin not registered");
    return plugin;
  }

  // uPlot's hook type is `Hook | Hook[]`. In our plugin we always register
  // arrays, so narrow with a cast for callsites.
  type HookFn = (u: uPlot) => void;
  function firstHook(h: HookFn | HookFn[] | undefined): HookFn {
    if (!h) throw new Error("hook missing");
    const arr = Array.isArray(h) ? h : [h];
    const fn = arr[0];
    if (!fn) throw new Error("hook empty");
    return fn;
  }

  it("renders interval header (tStart–tEnd) and aggregation labels when bucketMeta is provided", () => {
    const data: uPlot.AlignedData = [
      [1700000040, 1700000100, 1700000160], // tStart values for 3 buckets
      [3.2, 4.1, null],                       // speed (avg)
      [6.1, 7.0, null],                       // gust (max)
    ];
    const bucketMeta = [
      { tStart: 1700000040, tEnd: 1700000100 },
      { tStart: 1700000100, tEnd: 1700000160 },
      { tStart: 1700000160, tEnd: 1700000220 },
    ];
    const aggregationLabels = ["Avg Speed", "Peak Gust"];

    const opts: Omit<uPlot.Options, "width" | "height"> = {
      series: [
        {},
        { label: "Speed", stroke: "#6aae7a" },
        { label: "Gust", stroke: "#dba060" },
      ],
    } as uPlot.Options;

    render(
      <UPlotChart
        options={opts}
        data={data}
        bucketMeta={bucketMeta}
        aggregationLabels={aggregationLabels}
      />,
    );

    const plugin = getTooltipPlugin();
    const fake = makeFakeUPlot(
      UPlotConstructor.mock.calls[0]![0] as uPlot.Options,
      data,
    );
    firstHook(plugin.hooks.init as HookFn[] | undefined)(fake as unknown as uPlot);

    // Hover bucket index 1
    fake.cursor.idx = 1;
    firstHook(plugin.hooks.setCursor as HookFn[] | undefined)(fake as unknown as uPlot);

    const tooltip = fake.over.querySelector(".uplot-tooltip") as HTMLElement;
    expect(tooltip).not.toBeNull();
    expect(tooltip.style.display).toBe("block");

    const timeEl = tooltip.querySelector(".uplot-tooltip-time");
    // Interval header has an en-dash between two HH:MM tokens
    expect(timeEl?.textContent).toMatch(/\d{2}:\d{2}–\d{2}:\d{2}/);

    const labels = Array.from(tooltip.querySelectorAll(".uplot-tooltip-label"))
      .map((el) => el.textContent);
    expect(labels).toContain("Avg Speed:");
    expect(labels).toContain("Peak Gust:");

    const values = Array.from(tooltip.querySelectorAll(".uplot-tooltip-value"))
      .map((el) => el.textContent);
    expect(values).toContain("4.1");
    expect(values).toContain("7");
  });

  it("renders single-instant tooltip header when bucketMeta is omitted (raw mode)", () => {
    const data: uPlot.AlignedData = [
      [1700000000, 1700000016, 1700000032],
      [3.2, 4.1, 5.0],
    ];

    const opts: Omit<uPlot.Options, "width" | "height"> = {
      series: [
        {},
        { label: "Speed", stroke: "#6aae7a" },
      ],
    } as uPlot.Options;

    render(<UPlotChart options={opts} data={data} />);

    const plugin = getTooltipPlugin();
    const fake = makeFakeUPlot(
      UPlotConstructor.mock.calls[0]![0] as uPlot.Options,
      data,
    );
    firstHook(plugin.hooks.init as HookFn[] | undefined)(fake as unknown as uPlot);

    fake.cursor.idx = 1;
    firstHook(plugin.hooks.setCursor as HookFn[] | undefined)(fake as unknown as uPlot);

    const tooltip = fake.over.querySelector(".uplot-tooltip") as HTMLElement;
    const timeEl = tooltip.querySelector(".uplot-tooltip-time");
    // Single-instant header: NO en/em-dash separator between two HH:MM tokens
    expect(timeEl?.textContent).not.toMatch(/\d{2}:\d{2}–\d{2}:\d{2}/);

    const labelEls = tooltip.querySelectorAll(".uplot-tooltip-label");
    expect(labelEls[0]?.textContent).toBe("Speed:");
  });

  it("falls back to series.label when aggregationLabels is omitted but bucketMeta is present", () => {
    // Edge case: bucketMeta without explicit agg labels (defensive — caller
    // bug, but should still render gracefully).
    const data: uPlot.AlignedData = [
      [1700000040, 1700000100],
      [3.2, 4.1],
    ];
    const bucketMeta = [
      { tStart: 1700000040, tEnd: 1700000100 },
      { tStart: 1700000100, tEnd: 1700000160 },
    ];
    const opts: Omit<uPlot.Options, "width" | "height"> = {
      series: [{}, { label: "Speed", stroke: "#6aae7a" }],
    } as uPlot.Options;

    render(<UPlotChart options={opts} data={data} bucketMeta={bucketMeta} />);

    const plugin = getTooltipPlugin();
    const fake = makeFakeUPlot(
      UPlotConstructor.mock.calls[0]![0] as uPlot.Options,
      data,
    );
    firstHook(plugin.hooks.init as HookFn[] | undefined)(fake as unknown as uPlot);
    fake.cursor.idx = 0;
    firstHook(plugin.hooks.setCursor as HookFn[] | undefined)(fake as unknown as uPlot);

    const tooltip = fake.over.querySelector(".uplot-tooltip") as HTMLElement;
    const labelEl = tooltip.querySelector(".uplot-tooltip-label");
    expect(labelEl?.textContent).toBe("Speed:");
  });
});
