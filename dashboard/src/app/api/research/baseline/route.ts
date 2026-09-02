import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getResearchBaseline } from "@/lib/research/baseline";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(getResearchBaseline(), { headers: { "Cache-Control": "no-store" } });
}
