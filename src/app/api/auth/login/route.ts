import { NextRequest, NextResponse } from "next/server";
import { FreqtradeApiError, login } from "@/lib/freqtrade/client";
import { setSession } from "@/lib/auth";
import { checkRateLimit, recordFailedAttempt, resetAttempts } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const ip = req.headers.get("x-real-ip")?.trim() || forwardedFor || "unknown";

  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    const mins = Math.ceil((rate.remainingLockMs ?? 0) / 60000);
    return NextResponse.json({ error: `Too many attempts. Locked for ${mins} min.` }, { status: 429 });
  }

  try {
    const body = await req.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!username || !password || username.length > 256 || password.length > 512) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const tokens = await login(username, password);
    await setSession(tokens, username);
    resetAttempts(ip);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FreqtradeApiError && error.status === 401) {
      recordFailedAttempt(ip);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    return NextResponse.json({ error: "Freqtrade service unavailable" }, { status: 503 });
  }
}
