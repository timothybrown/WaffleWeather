import { getStationTodayString, zonedMidnightToUtc } from "./stationTime";
import {
  addCalendarDays,
  addCalendarMonthsFirst,
  dayLabel,
  formatYyyyMmDd,
  monthLabel,
  parseYyyyMmDd,
  requireYyyyMmDd,
  startOfContainingWeek,
  weekLabel,
  type CalendarDate,
} from "./calendarDate";

export type Range = "day" | "week" | "month" | "year";

export interface PeriodWindow {
  start: Date;
  end: Date;
  label: string;
  isCurrent: boolean;
}

function toStationMidnightUtc(timezone: string, date: CalendarDate): Date {
  return zonedMidnightToUtc(timezone, date.year, date.month, date.day);
}

function buildWindow(
  timezone: string,
  startDate: CalendarDate,
  endDate: CalendarDate,
  label: string,
  now: Date,
): PeriodWindow {
  const start = toStationMidnightUtc(timezone, startDate);
  const end = toStationMidnightUtc(timezone, endDate);
  const nowTime = now.getTime();

  return {
    start,
    end,
    label,
    isCurrent: nowTime >= start.getTime() && nowTime < end.getTime(),
  };
}

export function isValidYyyyMmDd(s: string): boolean {
  return parseYyyyMmDd(s) !== null;
}

export function periodForAnchor(
  anchor: string,
  range: Range,
  timezone: string,
  now = new Date(),
): PeriodWindow {
  const anchorDate = requireYyyyMmDd(anchor);

  switch (range) {
    case "day": {
      return buildWindow(
        timezone,
        anchorDate,
        addCalendarDays(anchorDate, 1),
        dayLabel(anchorDate),
        now,
      );
    }
    case "week": {
      const start = startOfContainingWeek(anchorDate);
      const end = addCalendarDays(start, 7);
      const endInclusive = addCalendarDays(end, -1);

      return buildWindow(timezone, start, end, weekLabel(start, endInclusive), now);
    }
    case "month": {
      const start = { year: anchorDate.year, month: anchorDate.month, day: 1 };
      const end = addCalendarMonthsFirst(start, 1);

      return buildWindow(timezone, start, end, monthLabel(start), now);
    }
    case "year": {
      const start = { year: anchorDate.year, month: 1, day: 1 };
      const end = { year: anchorDate.year + 1, month: 1, day: 1 };

      return buildWindow(timezone, start, end, String(anchorDate.year), now);
    }
  }
}

export function prevAnchor(anchor: string, range: Range): string {
  const anchorDate = requireYyyyMmDd(anchor);

  switch (range) {
    case "day":
      return formatYyyyMmDd(addCalendarDays(anchorDate, -1));
    case "week":
      return formatYyyyMmDd(addCalendarDays(startOfContainingWeek(anchorDate), -7));
    case "month":
      return formatYyyyMmDd(addCalendarMonthsFirst(anchorDate, -1));
    case "year":
      return formatYyyyMmDd({ year: anchorDate.year - 1, month: 1, day: 1 });
  }
}

export function nextAnchor(anchor: string, range: Range): string {
  const anchorDate = requireYyyyMmDd(anchor);

  switch (range) {
    case "day":
      return formatYyyyMmDd(addCalendarDays(anchorDate, 1));
    case "week":
      return formatYyyyMmDd(addCalendarDays(startOfContainingWeek(anchorDate), 7));
    case "month":
      return formatYyyyMmDd(addCalendarMonthsFirst(anchorDate, 1));
    case "year":
      return formatYyyyMmDd({ year: anchorDate.year + 1, month: 1, day: 1 });
  }
}

export function canonicalizeFutureAnchor(anchor: string, timezone: string, now = new Date()): string {
  if (!isValidYyyyMmDd(anchor)) {
    return anchor;
  }

  const stationToday = getStationTodayString(timezone, now);

  return anchor > stationToday ? stationToday : anchor;
}
