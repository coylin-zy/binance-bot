import { afterEach, describe, expect, it, vi } from "vitest";
import { appendAuditEvent, readAuditEvents } from "./store";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("audit store", () => {
  it("redacts nested credential fields and returns recent events", async () => {
    vi.stubEnv("AUDIT_LOG_PATH", "C:/does-not-exist/freqtrade-audit-test.jsonl");
    await appendAuditEvent({
      decision_id: "test-decision",
      event_type: "llm_explanation",
      request_timestamp: "2026-09-01T00:00:00.000Z",
      result_status: "available",
      payload: {
        safe: "visible",
        nested: { api_secret: "must-not-appear", safe: "still-visible" },
      },
    });
    const events = await readAuditEvents(1);
    expect(events[0].payload).toEqual({ nested: { safe: "still-visible" }, safe: "visible" });
    expect(JSON.stringify(events)).not.toContain("must-not-appear");
  });
});
