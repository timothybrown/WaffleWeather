"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { UnitSystem } from "@/lib/units";

interface UnitsContextValue {
  system: UnitSystem;
  toggle: () => void;
}

const UnitsContext = createContext<UnitsContextValue>({
  system: "metric",
  toggle: () => {},
});

export function useUnits() {
  return useContext(UnitsContext);
}

export default function UnitsProvider({ children }: { children: ReactNode }) {
  const [system, setSystem] = useState<UnitSystem>("metric");

  useEffect(() => {
    const stored = localStorage.getItem("ww-units");
    if (stored === "imperial" || stored === "metric") setSystem(stored);
  }, []);

  const toggle = useCallback(() => {
    setSystem((prev) => {
      const next = prev === "metric" ? "imperial" : "metric";
      localStorage.setItem("ww-units", next);
      return next;
    });
  }, []);

  return (
    <UnitsContext.Provider value={{ system, toggle }}>
      {children}
    </UnitsContext.Provider>
  );
}
