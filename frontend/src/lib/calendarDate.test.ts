import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  dayLabel,
  daysInMonth,
  formatYyyyMmDd,
  parseYyyyMmDd,
  startOfContainingWeek,
  weekLabel,
} from "./calendarDate";

describe("calendarDate", () => {
  it("parses and formats YYYY-MM-DD values", () => {
    expect(parseYyyyMmDd("2026-04-15")).toEqual({
      year: 2026,
      month: 4,
      day: 15,
    });
    expect(formatYyyyMmDd({ year: 2026, month: 4, day: 15 })).toBe("2026-04-15");
  });

  it("rejects invalid calendar dates", () => {
    expect(parseYyyyMmDd("2026-02-29")).toBeNull();
    expect(parseYyyyMmDd("not-a-date")).toBeNull();
  });

  it("handles leap years in daysInMonth", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it("adds days across month and year boundaries", () => {
    expect(addCalendarDays({ year: 2026, month: 5, day: 1 }, -1)).toEqual({
      year: 2026,
      month: 4,
      day: 30,
    });
    expect(addCalendarDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
  });

  it("finds the Sunday containing a date", () => {
    expect(startOfContainingWeek({ year: 2026, month: 4, day: 15 })).toEqual({
      year: 2026,
      month: 4,
      day: 12,
    });
  });

  it("uses canonical short-month labels for days and weeks", () => {
    expect(dayLabel({ year: 2026, month: 4, day: 10 })).toBe("Apr 10, 2026");
    expect(
      weekLabel(
        { year: 2026, month: 4, day: 12 },
        { year: 2026, month: 4, day: 18 },
      ),
    ).toBe("Apr 12–18, 2026");
    expect(
      weekLabel(
        { year: 2026, month: 4, day: 26 },
        { year: 2026, month: 5, day: 2 },
      ),
    ).toBe("Apr 26 – May 2, 2026");
    expect(
      weekLabel(
        { year: 2026, month: 12, day: 27 },
        { year: 2027, month: 1, day: 2 },
      ),
    ).toBe("Dec 27, 2026 – Jan 2, 2027");
  });
});
