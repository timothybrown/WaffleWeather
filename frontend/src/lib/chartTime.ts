import { getZonedParts } from "@/lib/stationTime";

export type ChartResolution = "raw" | "hourly" | "daily" | "monthly";

/**
 * Format a chart x-axis tick for a given resolution, in the station's timezone.
 *
 * Shared by the History and Indoor Climate pages — both render the same
 * day/week/month/year resolution ladder and must label axes identically.
 *
 * At hourly resolution, midnight is labelled with the weekday rather than
 * "00:00" so multi-day spans stay readable.
 */
export function formatChartTime(
  unix: number,
  resolution: string,
  timezone: string,
): string {
  const d = new Date(unix * 1000);

  if (resolution === "raw") {
    return d.toLocaleTimeString([], {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  if (resolution === "hourly") {
    const parts = getZonedParts(timezone, d);
    if (parts.hour === 0 && parts.minute === 0) {
      return d.toLocaleDateString([], { timeZone: timezone, weekday: "short" });
    }
    return d.toLocaleTimeString([], {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  if (resolution === "daily") {
    return d.toLocaleDateString([], {
      timeZone: timezone,
      month: "short",
      day: "numeric",
    });
  }

  return d.toLocaleDateString([], {
    timeZone: timezone,
    month: "short",
    year: "numeric",
  });
}
