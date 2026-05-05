import { describe, expect, it } from "vitest";

import {
  canonicalizeFutureAnchor,
  isValidYyyyMmDd,
  nextAnchor,
  periodForAnchor,
  prevAnchor,
} from "./historyPeriod";

const EASTERN = "America/New_York";

function expectWindow(
  window: ReturnType<typeof periodForAnchor>,
  expected: {
    start: string;
    end: string;
    label: string;
    isCurrent: boolean;
  },
) {
  expect(window.start.toISOString()).toBe(expected.start);
  expect(window.end.toISOString()).toBe(expected.end);
  expect(window.label).toBe(expected.label);
  expect(window.isCurrent).toBe(expected.isCurrent);
}

describe("isValidYyyyMmDd", () => {
  it("accepts well-formed valid calendar dates including leap years", () => {
    expect(isValidYyyyMmDd("2026-04-15")).toBe(true);
    expect(isValidYyyyMmDd("2024-02-29")).toBe(true);
    expect(isValidYyyyMmDd("2000-02-29")).toBe(true);
  });

  it("rejects malformed date strings", () => {
    expect(isValidYyyyMmDd("2026-4-15")).toBe(false);
    expect(isValidYyyyMmDd("2026-04-5")).toBe(false);
    expect(isValidYyyyMmDd("2026/04/15")).toBe(false);
    expect(isValidYyyyMmDd("abcd-ef-gh")).toBe(false);
  });

  it("rejects out-of-range and overflow dates", () => {
    expect(isValidYyyyMmDd("2026-00-15")).toBe(false);
    expect(isValidYyyyMmDd("2026-13-15")).toBe(false);
    expect(isValidYyyyMmDd("2026-04-00")).toBe(false);
    expect(isValidYyyyMmDd("2026-04-31")).toBe(false);
    expect(isValidYyyyMmDd("2026-02-29")).toBe(false);
    expect(isValidYyyyMmDd("1900-02-29")).toBe(false);
  });
});

describe("periodForAnchor", () => {
  it("returns a regular Eastern station-local day window", () => {
    expectWindow(periodForAnchor("2026-04-15", "day", EASTERN, new Date("2026-04-15T16:00:00Z")), {
      start: "2026-04-15T04:00:00.000Z",
      end: "2026-04-16T04:00:00.000Z",
      label: "Apr 15, 2026",
      isCurrent: true,
    });
  });

  it("returns a Tokyo station-local day window", () => {
    expectWindow(
      periodForAnchor("2026-04-15", "day", "Asia/Tokyo", new Date("2026-04-15T03:00:00Z")),
      {
        start: "2026-04-14T15:00:00.000Z",
        end: "2026-04-15T15:00:00.000Z",
        label: "Apr 15, 2026",
        isCurrent: true,
      },
    );
  });

  it("returns a 23-hour Eastern station-local day across spring-forward", () => {
    const window = periodForAnchor("2026-03-08", "day", EASTERN, new Date("2026-03-08T12:00:00Z"));

    expectWindow(window, {
      start: "2026-03-08T05:00:00.000Z",
      end: "2026-03-09T04:00:00.000Z",
      label: "Mar 8, 2026",
      isCurrent: true,
    });
    expect(window.end.getTime() - window.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("returns a 25-hour Eastern station-local day across fall-back", () => {
    const window = periodForAnchor("2026-11-01", "day", EASTERN, new Date("2026-11-01T12:00:00Z"));

    expectWindow(window, {
      start: "2026-11-01T04:00:00.000Z",
      end: "2026-11-02T05:00:00.000Z",
      label: "Nov 1, 2026",
      isCurrent: true,
    });
    expect(window.end.getTime() - window.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it("returns the Sun-Sat week containing a Wednesday anchor", () => {
    expectWindow(periodForAnchor("2026-04-15", "week", EASTERN, new Date("2026-04-15T16:00:00Z")), {
      start: "2026-04-12T04:00:00.000Z",
      end: "2026-04-19T04:00:00.000Z",
      label: "Apr 12–18, 2026",
      isCurrent: true,
    });
  });

  it("uses the anchor day when the week anchor is Sunday", () => {
    expectWindow(periodForAnchor("2026-04-12", "week", EASTERN, new Date("2026-04-12T16:00:00Z")), {
      start: "2026-04-12T04:00:00.000Z",
      end: "2026-04-19T04:00:00.000Z",
      label: "Apr 12–18, 2026",
      isCurrent: true,
    });
  });

  it("backs up to Sunday when the week anchor is Saturday", () => {
    expectWindow(periodForAnchor("2026-04-18", "week", EASTERN, new Date("2026-04-18T16:00:00Z")), {
      start: "2026-04-12T04:00:00.000Z",
      end: "2026-04-19T04:00:00.000Z",
      label: "Apr 12–18, 2026",
      isCurrent: true,
    });
  });

  it("labels cross-month weeks with both month names", () => {
    expectWindow(periodForAnchor("2026-04-01", "week", EASTERN, new Date("2026-04-01T16:00:00Z")), {
      start: "2026-03-29T04:00:00.000Z",
      end: "2026-04-05T04:00:00.000Z",
      label: "Mar 29 – Apr 4, 2026",
      isCurrent: true,
    });
  });

  it("labels cross-year weeks with both years", () => {
    expectWindow(periodForAnchor("2026-01-01", "week", EASTERN, new Date("2026-01-01T16:00:00Z")), {
      start: "2025-12-28T05:00:00.000Z",
      end: "2026-01-04T05:00:00.000Z",
      label: "Dec 28, 2025 – Jan 3, 2026",
      isCurrent: true,
    });
  });

  it("returns the calendar month containing the anchor", () => {
    expectWindow(periodForAnchor("2026-04-15", "month", EASTERN, new Date("2026-04-15T16:00:00Z")), {
      start: "2026-04-01T04:00:00.000Z",
      end: "2026-05-01T04:00:00.000Z",
      label: "April 2026",
      isCurrent: true,
    });
  });

  it("rolls December month windows into January of the next year", () => {
    expectWindow(periodForAnchor("2026-12-15", "month", EASTERN, new Date("2026-12-15T17:00:00Z")), {
      start: "2026-12-01T05:00:00.000Z",
      end: "2027-01-01T05:00:00.000Z",
      label: "December 2026",
      isCurrent: true,
    });
  });

  it("returns the calendar year containing the anchor", () => {
    expectWindow(periodForAnchor("2026-04-15", "year", EASTERN, new Date("2026-07-01T16:00:00Z")), {
      start: "2026-01-01T05:00:00.000Z",
      end: "2027-01-01T05:00:00.000Z",
      label: "2026",
      isCurrent: true,
    });
  });

  it("marks current only when now is within the half-open window", () => {
    expect(periodForAnchor("2026-04-15", "day", EASTERN, new Date("2026-04-15T04:00:00Z")).isCurrent).toBe(
      true,
    );
    expect(periodForAnchor("2026-04-15", "day", EASTERN, new Date("2026-04-15T03:59:59.999Z")).isCurrent).toBe(
      false,
    );
    expect(periodForAnchor("2026-04-15", "day", EASTERN, new Date("2026-04-16T04:00:00Z")).isCurrent).toBe(
      false,
    );
  });
});

describe("anchor mutation", () => {
  it("shifts day anchors by one calendar day", () => {
    expect(prevAnchor("2026-04-01", "day")).toBe("2026-03-31");
    expect(nextAnchor("2026-04-30", "day")).toBe("2026-05-01");
  });

  it("shifts week anchors by seven calendar days preserving day-of-week", () => {
    expect(prevAnchor("2026-01-03", "week")).toBe("2025-12-27");
    expect(nextAnchor("2026-12-26", "week")).toBe("2027-01-02");
  });

  it("shifts month anchors to the first day of the target month without day drift", () => {
    expect(prevAnchor("2026-03-31", "month")).toBe("2026-02-01");
    expect(nextAnchor("2026-01-31", "month")).toBe("2026-02-01");
    expect(prevAnchor("2026-01-15", "month")).toBe("2025-12-01");
    expect(nextAnchor("2026-12-15", "month")).toBe("2027-01-01");
  });

  it("shifts year anchors to January first of the target year", () => {
    expect(prevAnchor("2026-07-15", "year")).toBe("2025-01-01");
    expect(nextAnchor("2026-07-15", "year")).toBe("2027-01-01");
  });
});

describe("canonicalizeFutureAnchor", () => {
  it("leaves past and today anchors unchanged in the station timezone", () => {
    const now = new Date("2026-04-15T16:00:00Z");

    expect(canonicalizeFutureAnchor("2026-04-14", EASTERN, now)).toBe("2026-04-14");
    expect(canonicalizeFutureAnchor("2026-04-15", EASTERN, now)).toBe("2026-04-15");
  });

  it("clamps future anchors to station today", () => {
    expect(canonicalizeFutureAnchor("2026-04-16", EASTERN, new Date("2026-04-15T16:00:00Z"))).toBe(
      "2026-04-15",
    );
  });

  it("leaves malformed anchors unchanged without throwing", () => {
    const canonicalize = () =>
      canonicalizeFutureAnchor("not-a-date", EASTERN, new Date("2026-04-15T16:00:00Z"));

    expect(canonicalize).not.toThrow();
    expect(canonicalize()).toBe("not-a-date");
  });

  it("leaves overflow anchors unchanged without throwing", () => {
    const canonicalize = () =>
      canonicalizeFutureAnchor("2026-04-99", EASTERN, new Date("2026-04-15T16:00:00Z"));

    expect(canonicalize).not.toThrow();
    expect(canonicalize()).toBe("2026-04-99");
  });

  it("uses the station date when UTC has crossed midnight but the station has not", () => {
    const now = new Date("2026-04-16T02:00:00Z");

    expect(canonicalizeFutureAnchor("2026-04-16", EASTERN, now)).toBe("2026-04-15");
    expect(canonicalizeFutureAnchor("2026-04-15", EASTERN, now)).toBe("2026-04-15");
  });
});
