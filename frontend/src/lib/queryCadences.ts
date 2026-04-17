/**
 * Standard refetchInterval cadences for TanStack Query hooks.
 *
 * Usage:
 *   useQuery({ ..., refetchInterval: CADENCES.live })
 *
 * Pass `CADENCES.none` when a query should NOT poll on a schedule (e.g.,
 * historical/aggregate views). `false` is TanStack's canonical "no polling"
 * signal — we use that rather than `undefined` or `Infinity` for clarity.
 */
export const CADENCES = {
  /** ~Real-time observation updates (30s) — Observatory, Console, Lightning latest */
  live: 30_000,
  /** Summary / trend windows (60s) */
  summary: 60_000,
  /** 5-minute aggregates (sparklines, today extremes) */
  aggregate5m: 5 * 60 * 1000,
  /** Short-lived diagnostic polls (10s) */
  diagnostic: 10_000,
  /** Static reference data — never polls (stations, calendar, reports, history, wind-rose) */
  none: false as const,
} as const;

export type Cadence = (typeof CADENCES)[keyof typeof CADENCES];
