import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number to a fixed number of decimal places, or return "—" for null/undefined. */
export function fmt(value: number | null | undefined, decimals = 1): string {
  if (value == null) return "\u2014";
  return value.toFixed(decimals);
}

/** Format a wind direction in degrees to a compass point. */
export function degToCompass(deg: number | null | undefined): string {
  if (deg == null) return "\u2014";
  const dirs = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

/** Relative time string (e.g., "2 min ago"). */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "\u2014";
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
