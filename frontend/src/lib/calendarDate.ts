export interface CalendarDate {
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

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseYyyyMmDd(anchor: string): CalendarDate | null {
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

export function requireYyyyMmDd(anchor: string): CalendarDate {
  const parsed = parseYyyyMmDd(anchor);
  if (!parsed) {
    throw new Error(`Invalid YYYY-MM-DD date: ${anchor}`);
  }

  return parsed;
}

export function formatYyyyMmDd(date: CalendarDate): string {
  return [
    String(date.year).padStart(4, "0"),
    String(date.month).padStart(2, "0"),
    String(date.day).padStart(2, "0"),
  ].join("-");
}

export function addCalendarDays(date: CalendarDate, amount: number): CalendarDate {
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

export function addCalendarMonthsFirst(date: CalendarDate, amount: number): CalendarDate {
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

export function dayOfWeek(date: CalendarDate): number {
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

export function startOfContainingWeek(date: CalendarDate): CalendarDate {
  return addCalendarDays(date, -dayOfWeek(date));
}

export function dayLabel(date: CalendarDate): string {
  return `${SHORT_MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
}

export function weekLabel(start: CalendarDate, endInclusive: CalendarDate): string {
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

export function monthLabel(date: CalendarDate): string {
  return `${LONG_MONTHS[date.month - 1]} ${date.year}`;
}
