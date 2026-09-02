import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readAuditEvents } from "@/lib/audit/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rawLimit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const events = await readAuditEvents(Number.isFinite(rawLimit) ? rawLimit : 50);
  return NextResponse.json({ events, count: events.length }, { headers: { "Cache-Control": "no-store" } });
}
