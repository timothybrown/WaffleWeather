"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Preference = "auto" | "light" | "dark";
type Resolved = "light" | "dark";

interface ThemeContextValue {
  preference: Preference;
  resolved: Resolved;
  setPreference: (p: Preference) => void;
}

const STORAGE_KEY = "ww-theme";
const THEME_COLORS: Record<Resolved, string> = {
  light: "#faf7f2",
  dark: "#1a1714",
};
const preferenceListeners = new Set<() => void>();
let fallbackPreference: Preference | null = null;

function isPreference(value: string | null): value is Preference {
  return value === "light" || value === "dark" || value === "auto";
}

function getPreferenceSnapshot(): Preference {
  if (typeof window === "undefined") return "auto";
  if (fallbackPreference) return fallbackPreference;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

function getPreferenceServerSnapshot(): Preference {
  return "auto";
}

function storePreference(preference: Preference) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
    fallbackPreference = null;
  } catch {
    fallbackPreference = preference;
    // Storage can be unavailable in restricted browser contexts.
  }
  for (const listener of [...preferenceListeners]) listener();
}

function subscribePreference(cb: () => void) {
  if (typeof window === "undefined") return () => {};

  preferenceListeners.add(cb);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      fallbackPreference = null;
      cb();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    preferenceListeners.delete(cb);
    window.removeEventListener("storage", handleStorage);
  };
}

function subscribeSystemDark(cb: () => void) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function getSystemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "auto",
  resolved: "dark",
  setPreference: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(
    subscribePreference,
    getPreferenceSnapshot,
    getPreferenceServerSnapshot,
  );
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false);

  const resolved: Resolved =
    preference === "auto" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", THEME_COLORS[resolved]);
  }, [resolved]);

  const setPreference = useCallback((p: Preference) => {
    storePreference(p);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
