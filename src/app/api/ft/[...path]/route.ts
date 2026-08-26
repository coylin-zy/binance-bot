import { NextRequest, NextResponse } from "next/server";
import { getSession, setTokenCookies } from "@/lib/auth";
import { FreqtradeApiError, ftFetch } from "@/lib/freqtrade/client";
import { isAllowed } from "@/lib/freqtrade/allowlist";

type Params = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, params: Params["params"]) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = await params;
  const path = resolved.path.join("/");
  const method = req.method;

  if (!isAllowed(method, path)) {
    return NextResponse.json(
      { error: `Endpoint not allowed: ${method} ${path}` },
      { status: 403 }
    );
  }

  try {
    let body: unknown = undefined;
    if (method === "POST") {
      body = await req.json().catch(() => undefined);
    }
    const searchParams = req.nextUrl.searchParams.toString();
    const fullPath = path + (searchParams ? `?${searchParams}` : "");
    const result = await ftFetch(fullPath, {
      method,
      body,
      tokens: session,
    });
    if (result.refreshedTokens) {
      await setTokenCookies(result.refreshedTokens);
    }
    return NextResponse.json(result.data);
  } catch (err) {
    if (err instanceof FreqtradeApiError && err.status === 401) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }
    const status = err instanceof FreqtradeApiError && err.status === 504 ? 504 : 502;
    return NextResponse.json({ error: "Freqtrade service unavailable" }, { status });
  }
}

export async function GET(req: NextRequest, ctx: Params) {
  return handle(req, ctx.params);
}

export async function POST(req: NextRequest, ctx: Params) {
  return handle(req, ctx.params);
}
