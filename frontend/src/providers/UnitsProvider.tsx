"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
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

const STORAGE_KEY = "ww-units";
const unitListeners = new Set<() => void>();
let fallbackUnitSystem: UnitSystem | null = null;

function isUnitSystem(value: string | null): value is UnitSystem {
  return value === "imperial" || value === "metric";
}

function getUnitSystemSnapshot(): UnitSystem {
  if (typeof window === "undefined") return "metric";
  if (fallbackUnitSystem) return fallbackUnitSystem;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isUnitSystem(stored) ? stored : "metric";
  } catch {
    return "metric";
  }
}

function getUnitSystemServerSnapshot(): UnitSystem {
  return "metric";
}

function storeUnitSystem(system: UnitSystem) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, system);
    fallbackUnitSystem = null;
  } catch {
    fallbackUnitSystem = system;
    // Storage can be unavailable in restricted browser contexts.
  }
  for (const listener of [...unitListeners]) listener();
}

function toggleUnitSystem() {
  const current = getUnitSystemSnapshot();
  storeUnitSystem(current === "metric" ? "imperial" : "metric");
}

function subscribeUnitSystem(cb: () => void) {
  if (typeof window === "undefined") return () => {};

  unitListeners.add(cb);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      fallbackUnitSystem = null;
      cb();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    unitListeners.delete(cb);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useUnits() {
  return useContext(UnitsContext);
}

export default function UnitsProvider({ children }: { children: ReactNode }) {
  const system = useSyncExternalStore(
    subscribeUnitSystem,
    getUnitSystemSnapshot,
    getUnitSystemServerSnapshot,
  );

  const toggle = useCallback(() => {
    toggleUnitSystem();
  }, []);

  return (
    <UnitsContext.Provider value={{ system, toggle }}>
      {children}
    </UnitsContext.Provider>
  );
}
