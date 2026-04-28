import { describe, expect, it } from "vitest";
import { formatBatteryInfo } from "./diagnostics";

describe("formatBatteryInfo", () => {
  it("renders missing numeric battery readings as unknown instead of zero", () => {
    expect(formatBatteryInfo({ label: "Rain Gauge", type: "voltage", value: null }).display).toBe("—");
    expect(formatBatteryInfo({ label: "Lightning", type: "percentage", value: null }).level).toBe("unknown");
  });

  it("keeps valid voltage and percentage readings", () => {
    expect(formatBatteryInfo({ label: "Rain Gauge", type: "voltage", value: 1.5 })).toEqual({
      display: "1.50 V",
      level: "ok",
    });
    expect(formatBatteryInfo({ label: "Lightning", type: "percentage", value: 15 })).toEqual({
      display: "15%",
      level: "low",
    });
  });
});
