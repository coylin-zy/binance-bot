"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSWRConfig } from "swr";
import {
  summarizeRealtimeEvent,
  type RealtimeTone,
} from "@/lib/freqtrade/realtime-events";

const REFRESH_MAP: Record<string, string[]> = {
  entry: ["/api/ft/status"],
  entry_fill: ["/api/ft/status", "/api/ft/balance", "/api/ft/profit", "/api/ft/trades*"],
  entry_cancel: ["/api/ft/status"],
  exit: ["/api/ft/status"],
  exit_fill: [
    "/api/ft/status",
    "/api/ft/balance",
    "/api/ft/profit",
    "/api/ft/trades*",
    "/api/ft/daily",
    "/api/ft/weekly",
    "/api/ft/monthly",
  ],
  exit_cancel: ["/api/ft/status"],
  whitelist: ["/api/ft/whitelist"],
  status: ["/api/ft/status", "/api/ft/show_config"],
  new_candle: [],
  analyzed_df: [],
  warning: [],
  exception: [],
};

export interface RealtimeActivity {
  id: string;
  type: string;
  label: string;
  detail: string;
  tone: RealtimeTone;
  receivedAt: number;
}

interface RealtimeState {
  connected: boolean | null;
  lastEventAt: number | null;
  lastCandleAt: number | null;
  activity: RealtimeActivity[];
}

const RealtimeContext = createContext<RealtimeState | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [lastCandleAt, setLastCandleAt] = useState<number | null>(null);
  const [activity, setActivity] = useState<RealtimeActivity[]>([]);
  const connectedRef = useRef<boolean | null>(null);
  const eventCounterRef = useRef(0);

  const addActivity = useCallback((type: string, label: string, detail: string, tone: RealtimeTone) => {
    const receivedAt = Date.now();
    eventCounterRef.current += 1;
    setLastEventAt(receivedAt);
    setActivity((current) => [{
      id: `${receivedAt}-${eventCounterRef.current}`,
      type,
      label,
      detail,
      tone,
      receivedAt,
    }, ...current].slice(0, 8));
  }, []);

  const updateConnection = useCallback((nextConnected: boolean) => {
    if (connectedRef.current === nextConnected) return;
    connectedRef.current = nextConnected;
    setConnected(nextConnected);
    addActivity(
      "_connection",
      nextConnected ? "实时数据链路已连接" : "实时数据链路已断开",
      nextConnected ? "Freqtrade 事件推送正在工作" : "页面已自动切换为定时拉取",
      nextConnected ? "success" : "warning",
    );
  }, [addActivity]);

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onerror = () => updateConnection(false);

    const handler = (eventName: string) => (event: MessageEvent) => {
      let data: unknown = null;
      try {
        data = JSON.parse(event.data);
      } catch {
        data = null;
      }

      if (eventName === "_connection") {
        const nextConnected = Boolean(
          data && typeof data === "object" && "connected" in data
            ? (data as { connected?: unknown }).connected
            : false,
        );
        updateConnection(nextConnected);
        return;
      }

      const now = Date.now();
      setLastEventAt(now);
      if (eventName === "new_candle" || eventName === "analyzed_df") {
        setLastCandleAt(now);
      }

      const summary = summarizeRealtimeEvent(eventName, data);
      if (summary) addActivity(eventName, summary.label, summary.detail, summary.tone);

      const keys = REFRESH_MAP[eventName] ?? [];
      for (const key of keys) {
        if (key.endsWith("*")) {
          const prefix = key.slice(0, -1);
          void mutate((candidate) => typeof candidate === "string" && candidate.startsWith(prefix));
        } else {
          void mutate(key);
        }
      }
    };

    const events = Object.keys(REFRESH_MAP).concat("_connection");
    const handlers = new Map(events.map((event) => [event, handler(event)]));
    handlers.forEach((eventHandler, event) => es.addEventListener(event, eventHandler));

    return () => {
      handlers.forEach((eventHandler, event) => es.removeEventListener(event, eventHandler));
      es.close();
    };
  }, [addActivity, mutate, updateConnection]);

  const value = useMemo(() => ({ connected, lastEventAt, lastCandleAt, activity }), [
    activity,
    connected,
    lastCandleAt,
    lastEventAt,
  ]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error("useRealtime must be used inside RealtimeProvider");
  return value;
}
