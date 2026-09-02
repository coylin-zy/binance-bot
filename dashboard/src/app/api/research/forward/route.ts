import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getForwardRunSnapshot } from "@/lib/research/forward";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getForwardRunSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
