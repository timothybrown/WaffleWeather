import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render } from "@testing-library/react";
import UPlotChart from "./UPlotChart";
import type uPlot from "uplot";

// Mock uPlot — Canvas is not available in happy-dom
const { destroyMock, setDataMock, UPlotConstructor } = vi.hoisted(() => {
  const destroyMock = vi.fn();
  const setSizeMock = vi.fn();
  const setDataMock = vi.fn();
  const UPlotConstructor = vi.fn(function (this: Record<string, unknown>) {
    this.destroy = destroyMock;
    this.setSize = setSizeMock;
    this.setData = setDataMock;
  }) as unknown as Mock<(opts: uPlot.Options, data: uPlot.AlignedData, el: HTMLElement) => void>;
  return { destroyMock, setDataMock, UPlotConstructor };
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
});
