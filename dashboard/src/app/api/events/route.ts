import { NextRequest } from "next/server";
import { getSession, setTokenCookies } from "@/lib/auth";
import { FreqtradeApiError, ftFetch } from "@/lib/freqtrade/client";
import { realtimeManager } from "@/lib/freqtrade/realtime-manager";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const validation = await ftFetch("show_config", { tokens: session });
    if (validation.refreshedTokens) await setTokenCookies(validation.refreshedTokens);
  } catch (error) {
    if (error instanceof FreqtradeApiError && error.status === 401) {
      return new Response("Unauthorized", { status: 401 });
    }
    return new Response("Freqtrade service unavailable", { status: 503 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // stream already closed
        }
      };

      send("_connection", { connected: realtimeManager.connected });

      const unsubscribe = realtimeManager.subscribe(send);

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
