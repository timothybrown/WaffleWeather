"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  useState,
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
  const [preference, setPreferenceState] = useState<Preference>("auto");
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "auto") {
      setPreferenceState(stored);
    }
  }, []);

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
    setPreferenceState(p);
    localStorage.setItem(STORAGE_KEY, p);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
