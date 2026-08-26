import { WebSocket } from "ws";

type Subscriber = (event: string, data: unknown) => void;

const SUBSCRIBE_TYPES = [
  "entry", "entry_fill", "entry_cancel",
  "exit", "exit_fill", "exit_cancel",
  "whitelist", "analyzed_df", "new_candle",
  "status", "warning", "exception",
];

class RealtimeManager {
  private ws: WebSocket | null = null;
  private subscribers = new Set<Subscriber>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

  get connected() {
    return this._connected;
  }

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    this.ensureConnected();
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private broadcast(event: string, data: unknown) {
    this.subscribers.forEach((fn) => {
      try {
        fn(event, data);
      } catch {
        // subscriber callback error should not break others
      }
    });
  }

  ensureConnected() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.reconnectTimer) return;

    const wsToken = process.env.FREQTRADE_WS_TOKEN;
    const ftUrl = process.env.FREQTRADE_URL ?? "http://freqtrade:8080";
    const wsUrl = ftUrl.replace(/^http/, "ws") + `/api/v1/message/ws?token=${wsToken}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      this._connected = true;
      this.reconnectAttempts = 0;
      this.ws?.send(JSON.stringify({ type: "subscribe", data: SUBSCRIBE_TYPES }));
      this.broadcast("_connection", { connected: true });
    });

    this.ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.broadcast(msg.type ?? "unknown", msg.data ?? msg);
      } catch {
        // ignore malformed messages
      }
    });

    this.ws.on("close", () => {
      this._connected = false;
      this.broadcast("_connection", { connected: false });
      this.scheduleReconnect();
    });

    this.ws.on("error", () => {
      this._connected = false;
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.subscribers.size === 0) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }
}

const globalForRealtime = globalThis as unknown as { realtimeManager?: RealtimeManager };

export const realtimeManager =
  globalForRealtime.realtimeManager ?? new RealtimeManager();

if (process.env.NODE_ENV !== "production") {
  globalForRealtime.realtimeManager = realtimeManager;
}
