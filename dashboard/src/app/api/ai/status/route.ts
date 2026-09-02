import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { llmPublicConfig } from "@/lib/llm/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    ...llmPublicConfig(),
    read_only: true,
    tasks: ["market_summary", "strategy_review", "trade_explanation"],
  }, { headers: { "Cache-Control": "no-store" } });
}
