export interface StationTodayParts {
  year: number;
  month: number;
  day: number;
  startIso: string;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const DATE_SEARCH_RADIUS_MS = 48 * 60 * 60 * 1000;

export function getZonedParts(timezone: string, instant: Date): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function compareZonedDate(parts: ZonedParts, year: number, month: number, day: number): number {
  if (parts.year !== year) {
    return parts.year < year ? -1 : 1;
  }
  if (parts.month !== month) {
    return parts.month < month ? -1 : 1;
  }
  if (parts.day !== day) {
    return parts.day < day ? -1 : 1;
  }

  return 0;
}

function compareInstantToZonedDate(
  timezone: string,
  instantMs: number,
  year: number,
  month: number,
  day: number,
): number {
  return compareZonedDate(getZonedParts(timezone, new Date(instantMs)), year, month, day);
}

export function zonedMidnightToUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
): Date {
  const nominalUtcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0);
  let low = nominalUtcMidnight - DATE_SEARCH_RADIUS_MS;
  let high = nominalUtcMidnight + DATE_SEARCH_RADIUS_MS;

  while (compareInstantToZonedDate(timezone, low, year, month, day) >= 0) {
    high = low;
    low -= DATE_SEARCH_RADIUS_MS;
  }

  while (compareInstantToZonedDate(timezone, high, year, month, day) < 0) {
    low = high;
    high += DATE_SEARCH_RADIUS_MS;
  }

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (compareInstantToZonedDate(timezone, mid, year, month, day) >= 0) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return new Date(high);
}

export function getStationTodayParts(timezone: string, now = new Date()): StationTodayParts {
  const parts = getZonedParts(timezone, now);
  const start = zonedMidnightToUtc(timezone, parts.year, parts.month, parts.day);

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    startIso: start.toISOString(),
  };
}

export function getStationToday(timezone: string, now = new Date()): Date {
  return new Date(getStationTodayParts(timezone, now).startIso);
}

export function getStationTodayString(timezone: string, now = new Date()): string {
  const { year, month, day } = getStationTodayParts(timezone, now);

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}
