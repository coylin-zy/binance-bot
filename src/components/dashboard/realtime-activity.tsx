"use client";

import { RadioTower } from "lucide-react";
import { useRealtime } from "@/hooks/use-realtime";
import type { RealtimeTone } from "@/lib/freqtrade/realtime-events";

const TONE_COLOR: Record<RealtimeTone, string> = {
  info: "var(--info)",
  success: "var(--terminal)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

export function RealtimeActivityPanel() {
  const { activity, connected } = useRealtime();

  return (
    <section className="terminal-panel overflow-hidden" aria-label="最近实时事件">
      <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4">
        <div>
          <div className="terminal-label text-[var(--terminal)]">Live event buffer</div>
          <h2 className="mt-1 font-display text-sm font-bold">最近实时事件</h2>
        </div>
        <RadioTower size={18} className={connected ? "text-[var(--terminal)]" : "text-[var(--muted)]"} />
      </div>

      {activity.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs leading-5 text-[var(--muted)]">
          正在等待 Freqtrade 事件。REST 指标会继续按计划刷新。
        </div>
      ) : (
        <ol className="divide-y divide-[var(--line-soft)]">
          {activity.slice(0, 5).map((event) => (
            <li key={event.id} className="grid grid-cols-[8px_minmax(0,1fr)_auto] gap-3 px-5 py-3.5">
              <span className="status-dot mt-1.5" style={{ color: TONE_COLOR[event.tone], background: TONE_COLOR[event.tone] }} />
              <div className="min-w-0">
                <div className="truncate text-[0.68rem] font-bold text-[var(--text)]">{event.label}</div>
                <div className="mt-1 line-clamp-2 text-[0.6rem] leading-4 text-[var(--muted)]">{event.detail}</div>
              </div>
              <time className="terminal-value text-[0.58rem] text-[var(--muted)]" dateTime={new Date(event.receivedAt).toISOString()}>
                {new Date(event.receivedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </time>
            </li>
          ))}
        </ol>
      )}

      <div className="border-t border-[var(--line-soft)] px-5 py-3 text-[0.58rem] leading-4 text-[var(--muted)]">
        仅保留当前浏览器会话最近 8 条安全摘要，不记录凭据或原始消息体。
      </div>
    </section>
  );
}
