import { getStationTodayString, zonedMidnightToUtc } from "./stationTime";

export type Range = "day" | "week" | "month" | "year";

export interface PeriodWindow {
  start: Date;
  end: Date;
  label: string;
  isCurrent: boolean;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const DAYS_BEFORE_MONTH = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseYyyyMmDd(anchor: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchor);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  return { year, month, day };
}

function requireYyyyMmDd(anchor: string): CalendarDate {
  const parsed = parseYyyyMmDd(anchor);
  if (!parsed) {
    throw new Error(`Invalid YYYY-MM-DD date: ${anchor}`);
  }

  return parsed;
}

function formatYyyyMmDd(date: CalendarDate): string {
  return [
    String(date.year).padStart(4, "0"),
    String(date.month).padStart(2, "0"),
    String(date.day).padStart(2, "0"),
  ].join("-");
}

function addCalendarDays(date: CalendarDate, amount: number): CalendarDate {
  let year = date.year;
  let month = date.month;
  let day = date.day;

  for (let remaining = amount; remaining > 0; remaining -= 1) {
    day += 1;
    if (day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }

  for (let remaining = amount; remaining < 0; remaining += 1) {
    day -= 1;
    if (day < 1) {
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      day = daysInMonth(year, month);
    }
  }

  return { year, month, day };
}

function addCalendarMonthsFirst(date: CalendarDate, amount: number): CalendarDate {
  let year = date.year;
  let month = date.month + amount;

  while (month < 1) {
    month += 12;
    year -= 1;
  }

  while (month > 12) {
    month -= 12;
    year += 1;
  }

  return { year, month, day: 1 };
}

function dayOfWeek(date: CalendarDate): number {
  let year = date.year;
  if (date.month < 3) {
    year -= 1;
  }

  return (
    year +
    Math.floor(year / 4) -
    Math.floor(year / 100) +
    Math.floor(year / 400) +
    DAYS_BEFORE_MONTH[date.month - 1] +
    date.day
  ) % 7;
}

function toStationMidnightUtc(timezone: string, date: CalendarDate): Date {
  return zonedMidnightToUtc(timezone, date.year, date.month, date.day);
}

function dayLabel(date: CalendarDate): string {
  return `${SHORT_MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
}

function weekLabel(start: CalendarDate, endInclusive: CalendarDate): string {
  if (start.year === endInclusive.year && start.month === endInclusive.month) {
    return `${SHORT_MONTHS[start.month - 1]} ${start.day}–${endInclusive.day}, ${start.year}`;
  }

  if (start.year === endInclusive.year) {
    return `${SHORT_MONTHS[start.month - 1]} ${start.day} – ${
      SHORT_MONTHS[endInclusive.month - 1]
    } ${endInclusive.day}, ${start.year}`;
  }

  return `${SHORT_MONTHS[start.month - 1]} ${start.day}, ${start.year} – ${
    SHORT_MONTHS[endInclusive.month - 1]
  } ${endInclusive.day}, ${endInclusive.year}`;
}

function monthLabel(date: CalendarDate): string {
  return `${LONG_MONTHS[date.month - 1]} ${date.year}`;
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
      const start = addCalendarDays(anchorDate, -dayOfWeek(anchorDate));
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
      return formatYyyyMmDd(addCalendarDays(anchorDate, -7));
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
      return formatYyyyMmDd(addCalendarDays(anchorDate, 7));
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
