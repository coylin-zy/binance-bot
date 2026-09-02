import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runtimeLineage } from "@/lib/audit/lineage";
import { appendAuditEvent, makeDecisionId, payloadSnapshotHash } from "@/lib/audit/store";

export const dynamic = "force-dynamic";

const EVENT_TYPES = new Set(["rule_signal", "risk_check", "system"] as const);

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as {
    event_type?: unknown;
    decision_id?: unknown;
    market_data_timestamp?: unknown;
    payload?: unknown;
    result_status?: unknown;
  } | null;
  const eventType = typeof body?.event_type === "string" && EVENT_TYPES.has(body.event_type as never)
    ? body.event_type as "rule_signal" | "risk_check" | "system"
    : null;
  const payload = body?.payload;
  if (!eventType || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "event_type and object payload are required" }, { status: 400 });
  }
  const encoded = JSON.stringify(payload);
  if (new TextEncoder().encode(encoded).byteLength > 12_000) {
    return NextResponse.json({ error: "audit payload is too large" }, { status: 413 });
  }
  const decisionId = typeof body?.decision_id === "string" && /^[a-zA-Z0-9._:-]{3,128}$/.test(body.decision_id)
    ? body.decision_id
    : makeDecisionId();
  const safePayload = payload as Record<string, unknown>;
  await appendAuditEvent({
    decision_id: decisionId,
    event_type: eventType,
    request_timestamp: new Date().toISOString(),
    market_data_timestamp: typeof body?.market_data_timestamp === "string"
      ? body.market_data_timestamp
      : undefined,
    ...runtimeLineage(),
    input_snapshot_hash: payloadSnapshotHash(safePayload),
    result_status: typeof body?.result_status === "string" ? body.result_status.slice(0, 64) : "recorded",
    payload: safePayload,
  });
  return NextResponse.json({ decision_id: decisionId, status: "recorded", event_type: eventType });
}
