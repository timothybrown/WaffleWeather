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

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || `ws://${typeof window !== "undefined" ? window.location.host : "localhost:8000"}/ws/live`;

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
  const backoffRef = useRef(1000);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      backoffRef.current = 1000;
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
      // Reconnect with exponential backoff
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, 30_000);
      setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ latestObservation, diagnostics, connected }}>
      {children}
    </WebSocketContext.Provider>
  );
}
