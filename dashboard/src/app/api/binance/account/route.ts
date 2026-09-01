import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBinanceAccountSnapshot } from "@/lib/binance/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Account observability is optional: upstream failure is represented in the
  // payload and never blocks the Freqtrade dry-run dashboard.
  const snapshot = await getBinanceAccountSnapshot();
  return NextResponse.json(snapshot, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
