"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Observation } from "@/generated/models";

export interface BatteryInfo {
  label: string;
  type: "boolean" | "voltage" | "percentage";
  value: number | string;
}

export interface Diagnostics {
  batteries: Record<string, BatteryInfo>;
  gateway: {
    runtime?: number;
    heap?: number;
    interval?: number;
  };
}

interface WebSocketContextValue {
  latestObservation: Observation | null;
  diagnostics: Diagnostics | null;
  connected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  latestObservation: null,
  diagnostics: null,
  connected: false,
});

export function useWebSocket() {
  return useContext(WebSocketContext);
}

function getWsUrl() {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window === "undefined") return "ws://localhost:8000/ws/live";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/live`;
}

const WS_URL = getWsUrl();

// Cap reconnect attempts so a permanently-gone endpoint doesn't drain battery
// on mobile PWAs. Reset to zero on a successful open so long-lived sessions
// that only hit transient blips aren't penalized.
export const MAX_RETRIES = 30;

export default function WebSocketProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [latestObservation, setLatestObservation] =
    useState<Observation | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Reset the retry counter so a long-lived session that survives a
      // transient outage isn't penalized by the global cap.
      retryCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Extract diagnostics before setting observation
        if (data.diagnostics) {
          setDiagnostics(data.diagnostics as Diagnostics);
          delete data.diagnostics;
        }
        setLatestObservation(data as Observation);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      // Stop retrying once we've hit the cap so a permanently-gone endpoint
      // doesn't spin forever.
      if (retryCountRef.current >= MAX_RETRIES) {
        return;
      }

      // Exponential backoff capped at 30s, plus 0-30% random jitter so a fleet
      // of clients doesn't synchronize into a thundering herd after an outage.
      const base = Math.min(1000 * 2 ** retryCountRef.current, 30_000);
      const jitter = Math.random() * 0.3 * base;
      const delay = base + jitter;
      retryCountRef.current += 1;

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      // Cancel any pending reconnect so the timer can't fire after the
      // component has unmounted (which would call connect() on a dead tree
      // and trigger "setState on unmounted component" warnings).
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ latestObservation, diagnostics, connected }}>
      {children}
    </WebSocketContext.Provider>
  );
}
