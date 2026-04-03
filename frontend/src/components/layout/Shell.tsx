"use client";

import { useCallback, useState } from "react";
import { RiMenuLine } from "@remixicon/react";
import Sidebar from "./Sidebar";

export default function Shell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <>
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />

      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface-alt/95 px-4 backdrop-blur-sm md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
            aria-label="Open menu"
          >
            <RiMenuLine className="h-5 w-5" />
          </button>
          <span className="text-xl drop-shadow-sm">&#x1F9C7;</span>
          <span className="font-display text-base font-semibold tracking-tight text-text">
            WaffleWeather
          </span>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="app-footer px-6 py-4 text-center text-xs text-text-faint">
          Written by Timothy Brown and Claude with lots of love and coffee.
        </footer>
      </div>
    </>
  );
}
