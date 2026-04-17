"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RiDashboardLine,
  RiDashboard2Line,
  RiFlashlightLine,
  RiHistoryLine,
  RiFileChartLine,
  RiCompassLine,
  RiSettings4Line,
  RiCloseLine,
  RiComputerLine,
  RiSunLine,
  RiMoonLine,
  RiRefreshLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/providers/WebSocketProvider";
import { useUnits } from "@/providers/UnitsProvider";
import { useTheme } from "@/providers/ThemeProvider";

const navItems = [
  { href: "/", label: "Observatory", icon: RiDashboardLine },
  { href: "/console", label: "Console", icon: RiDashboard2Line },
  { href: "/lightning", label: "Lightning", icon: RiFlashlightLine },
  { href: "/wind-rose", label: "Wind Rose", icon: RiCompassLine },
  { href: "/history", label: "History", icon: RiHistoryLine },
  { href: "/reports", label: "Reports", icon: RiFileChartLine },
  { href: "/settings", label: "Diagnostics", icon: RiSettings4Line },
];

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { connected, offline, reconnect } = useWebSocket();
  const { system, toggle } = useUnits();
  const { preference, setPreference } = useTheme();

  // Close sidebar when navigating on mobile
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [initialPath] = useState(pathname);
  useEffect(() => {
    if (pathname !== initialPath) {
      onCloseRef.current();
    }
  }, [pathname, initialPath]);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />

      {/* Sidebar panel */}
      <aside
        className={cn(
          "fixed z-50 flex h-full w-56 shrink-0 flex-col border-r border-border bg-surface-alt transition-transform duration-300 ease-out",
          "md:relative md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo — hidden on mobile since Shell's sticky header already shows it */}
        <div className="hidden h-16 items-center border-b border-border px-5 md:flex">
          <div className="flex items-center gap-3">
            <img src="/waffle-logo.png" alt="" width={28} height={28} className="drop-shadow-sm" />
            <span className="font-display text-lg font-semibold tracking-tight text-text">
              WaffleWeather
            </span>
          </div>
        </div>
        {/* Mobile close button */}
        <div className="flex items-center justify-end px-3 pt-3 md:hidden">
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:text-text"
            aria-label="Close menu"
          >
            <RiCloseLine className="h-5 w-5" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "sidebar-nav-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:text-text",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer: theme toggle, connection status, unit toggle */}
        <div className="space-y-3 border-t border-border p-4">
          <div
            role="radiogroup"
            aria-label="Theme"
            className="flex w-full items-center rounded-lg border border-border bg-surface text-xs font-medium"
          >
            {(
              [
                { value: "auto", icon: RiComputerLine, label: "Auto" },
                { value: "light", icon: RiSunLine, label: "Light" },
                { value: "dark", icon: RiMoonLine, label: "Dark" },
              ] as const
            ).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={preference === value}
                title={label}
                onClick={() => setPreference(value)}
                className={cn(
                  "flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors",
                  preference === value
                    ? "bg-primary/15 text-primary"
                    : "text-text-faint hover:text-text-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="sr-only">{label}</span>
              </button>
            ))}
          </div>
          {offline ? (
            <div className="flex items-center gap-2 text-xs text-text-faint">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-danger" />
              <span className="flex-1 truncate">Offline</span>
              <button
                type="button"
                onClick={reconnect}
                aria-label="Retry connection"
                title="Retry connection"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:text-text"
              >
                <RiRefreshLine className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 text-xs text-text-faint">
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full",
                  connected ? "bg-success live-pulse" : "bg-danger",
                )}
              />
              {connected ? "Live" : "Disconnected"}
            </div>
          )}
          <button
            onClick={toggle}
            className="flex w-full items-center rounded-lg border border-border bg-surface text-xs font-medium"
            aria-label="Toggle unit system"
          >
            <span
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-center transition-colors",
                system === "metric"
                  ? "bg-primary/15 text-primary"
                  : "text-text-faint hover:text-text-muted",
              )}
            >
              Metric
            </span>
            <span
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-center transition-colors",
                system === "imperial"
                  ? "bg-primary/15 text-primary"
                  : "text-text-faint hover:text-text-muted",
              )}
            >
              Imperial
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
