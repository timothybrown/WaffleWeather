export type BatteryLevel = "ok" | "low" | "unknown";

export interface BatteryInfoLike {
  label?: string;
  type: "boolean" | "voltage" | "percentage";
  value: number | string | null | undefined;
}

export interface FormattedBatteryInfo {
  display: string;
  level: BatteryLevel;
}

function numericValue(value: BatteryInfoLike["value"]): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatBatteryInfo(info: BatteryInfoLike): FormattedBatteryInfo {
  if (info.type === "boolean") {
    if (info.value == null) return { display: "\u2014", level: "unknown" };
    const isOk = info.value === "OFF" || info.value === 0;
    return {
      display: isOk ? "OK" : "Low",
      level: isOk ? "ok" : "low",
    };
  }

  const value = numericValue(info.value);
  if (value == null) return { display: "\u2014", level: "unknown" };

  if (info.type === "voltage") {
    return {
      display: `${value.toFixed(2)} V`,
      level: value > 1.2 ? "ok" : "low",
    };
  }

  return {
    display: `${Math.round(value)}%`,
    level: value > 20 ? "ok" : "low",
  };
}
