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
});
