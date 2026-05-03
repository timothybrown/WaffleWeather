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
});
