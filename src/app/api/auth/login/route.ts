import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/freqtrade/client";
import { setSession } from "@/lib/auth";
import { checkRateLimit, recordFailedAttempt, resetAttempts } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    const mins = Math.ceil((rate.remainingLockMs ?? 0) / 60000);
    return NextResponse.json({ error: `Too many attempts. Locked for ${mins} min.` }, { status: 429 });
  }

  try {
    const body = await req.json();
    const username = body.username as string;
    const password = body.password as string;
    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const tokens = await login(username, password);
    await setSession(tokens, username);
    resetAttempts(ip);
    return NextResponse.json({ ok: true });
  } catch {
    recordFailedAttempt(ip);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
}
