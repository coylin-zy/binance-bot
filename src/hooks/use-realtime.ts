"use client";

import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

const REFRESH_MAP: Record<string, string[]> = {
  entry_fill: ["/api/ft/status", "/api/ft/balance", "/api/ft/profit", "/api/ft/trades"],
  entry_cancel: ["/api/ft/status"],
  exit: ["/api/ft/status"],
  exit_fill: [
    "/api/ft/status",
    "/api/ft/balance",
    "/api/ft/profit",
    "/api/ft/trades",
    "/api/ft/daily",
    "/api/ft/weekly",
    "/api/ft/monthly",
  ],
  exit_cancel: ["/api/ft/status"],
  whitelist: ["/api/ft/whitelist"],
  status: ["/api/ft/status"],
  new_candle: [],
};

export function useRealtime() {
  const { mutate } = useSWRConfig();
  const [connected, setConnected] = useState<boolean | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    const handler = (eventName: string) => {
      return (e: MessageEvent) => {
        if (eventName === "_connection") {
          try {
            const data = JSON.parse(e.data);
            setConnected(data.connected);
          } catch {}
          return;
        }
        const keys = REFRESH_MAP[eventName];
        if (keys) {
          keys.forEach((key) => mutate(key));
        }
      };
    };

    const events = Object.keys(REFRESH_MAP).concat("_connection");
    const handlers = new Map(events.map((event) => [event, handler(event)]));
    handlers.forEach((eventHandler, event) => es.addEventListener(event, eventHandler));

    return () => {
      handlers.forEach((eventHandler, event) => es.removeEventListener(event, eventHandler));
      es.close();
      eventSourceRef.current = null;
    };
  }, [mutate]);

  return { connected };
}
