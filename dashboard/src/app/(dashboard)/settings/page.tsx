"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, CirclePause, CirclePlay, LockKeyhole, Octagon, ServerCog, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelError, PanelLoading } from "@/components/dashboard/data-state";
import { Button } from "@/components/ui/button";
import { postApi } from "@/lib/api";
import { useBotStatus } from "@/hooks/use-bot-status";

type BotAction = "pause" | "stop" | "start";

const actionCopy: Record<BotAction, { title: string; description: string }> = {
  pause: { title: "暂停新开仓", description: "机器人将保留现有持仓，但暂停创建新交易。" },
  stop: { title: "停止机器人", description: "机器人将停止交易循环。该操作不会强制平仓，但需要人工再次启动。" },
  start: { title: "启动机器人", description: "机器人将恢复策略扫描与自动交易循环。" },
};

export default function SettingsPage() {
  const { config, error: configError, isLoading, mutate } = useBotStatus();
  const [loading, setLoading] = useState<BotAction | null>(null);
  const [pending, setPending] = useState<BotAction | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const state = (config?.state ?? "UNKNOWN").toUpperCase();
  const stateColor = state === "RUNNING" ? "var(--terminal)" : state === "PAUSED" ? "var(--warning)" : "var(--danger)";
  const safeConfig = useMemo(() => ({
    bot_name: config?.bot_name ?? null,
    strategy: config?.strategy ?? null,
    timeframe: config?.timeframe ?? null,
    exchange: config?.exchange ?? null,
    trading_mode: config?.trading_mode ?? null,
    stake_currency: config?.stake_currency ?? null,
    stake_amount: config?.stake_amount ?? null,
    max_open_trades: config?.max_open_trades ?? null,
    dry_run: config?.dry_run ?? null,
  }), [config]);

  async function sendAction(action: BotAction) {
    setPending(null);
    setLoading(action);
    setMessage(null);
    try {
      await postApi(`/api/ft/${action}`);
      await mutate();
      setMessage({ tone: "success", text: `${actionCopy[action].title}指令已由 Freqtrade 接收。` });
    } catch (actionError) {
      setMessage({ tone: "error", text: actionError instanceof Error ? actionError.message : "操作失败，请稍后重试。" });
    } finally {
      setLoading(null);
    }
  }

  if (configError) return <div className="mx-auto max-w-[1540px]"><PageHeader eyebrow="[ SYS.OPERATIONS_CONSOLE ]" title="运行控制与安全配置" description="安全的机器人生命周期控制。" /><div className="terminal-panel"><PanelError /></div></div>;
  if (isLoading) return <div className="mx-auto max-w-[1540px]"><PageHeader eyebrow="[ SYS.OPERATIONS_CONSOLE ]" title="运行控制与安全配置" description="安全的机器人生命周期控制。" /><div className="terminal-panel"><PanelLoading label="正在读取机器人配置" /></div></div>;

  return (
    <div className="mx-auto max-w-[1540px]">
      <PageHeader
        eyebrow="[ SYS.OPERATIONS_CONSOLE ]"
        title="运行控制与安全配置"
        description="仅开放暂停、停止与启动三个受控生命周期动作。配置以只读方式呈现，手动交易与配置写入继续由服务端拒绝。"
        actions={<div className="flex items-center gap-2 border border-[var(--line-soft)] bg-[var(--surface-low)] px-3 py-2 text-[0.66rem] font-bold" style={{ color: stateColor }}><span className="status-dot" />BOT_{state}</div>}
      />

      {message && (
        <div className={`mb-5 flex items-start gap-3 border p-4 text-xs ${message.tone === "success" ? "border-[rgba(0,255,65,0.3)] bg-[rgba(0,255,65,0.04)] text-[var(--terminal)]" : "border-[rgba(255,180,171,0.3)] bg-[rgba(147,0,10,0.14)] text-[var(--danger)]"}`} role="status" aria-live="polite">
          {message.tone === "success" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="space-y-5">
          <section className="terminal-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4">
              <div><div className="terminal-label text-[var(--terminal)]">Bot execution state</div><h2 className="mt-1 font-display text-sm font-bold">机器人生命周期</h2></div>
              <Bot size={20} style={{ color: stateColor }} />
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-5 border-b border-[var(--line-soft)] pb-6 sm:flex-row sm:items-center">
                <div><div className="terminal-label">Current state</div><div className="terminal-value mt-2 flex items-center gap-3 text-2xl font-bold" style={{ color: stateColor }}><span className="status-dot" />{state}</div></div>
                <div className="text-left sm:text-right"><div className="terminal-label">Execution mode</div><div className="mt-2 text-sm font-bold" style={{ color: config?.dry_run ? "var(--warning)" : "var(--danger)" }}>{config?.dry_run ? "DRY-RUN / SPOT" : "LIVE / VERIFY"}</div></div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {state === "RUNNING" && <><Button variant="outline" onClick={() => sendAction("pause")} disabled={!!loading}><CirclePause size={16} />{loading === "pause" ? "正在发送" : "暂停新开仓"}</Button><Button variant="destructive" onClick={() => setPending("stop")} disabled={!!loading}><Octagon size={16} />停止机器人</Button></>}
                {state === "PAUSED" && <><Button onClick={() => sendAction("start")} disabled={!!loading}><CirclePlay size={16} />{loading === "start" ? "正在发送" : "恢复运行"}</Button><Button variant="destructive" onClick={() => setPending("stop")} disabled={!!loading}><Octagon size={16} />停止机器人</Button></>}
                {state === "STOPPED" && <Button className="sm:col-span-2" onClick={() => sendAction("start")} disabled={!!loading}><CirclePlay size={16} />{loading === "start" ? "正在发送" : "启动机器人"}</Button>}
                {!["RUNNING", "PAUSED", "STOPPED"].includes(state) && <div className="sm:col-span-2 border border-[rgba(255,180,171,0.28)] p-4 text-xs text-[var(--danger)]">未知机器人状态，控制按钮已禁用。</div>}
              </div>
            </div>
          </section>

          <section className="terminal-panel overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[var(--line-soft)] px-5 py-4"><ShieldCheck size={18} className="text-[var(--terminal)]" /><div><div className="terminal-label text-[var(--terminal)]">Security boundary</div><h2 className="mt-1 font-display text-sm font-bold">服务端功能边界</h2></div></div>
            <div className="grid gap-px bg-[var(--line-soft)] sm:grid-cols-3">
              {[{ icon: CheckCircle2, label: "允许", value: "监控读取" }, { icon: ServerCog, label: "允许", value: "暂停/停止/启动" }, { icon: LockKeyhole, label: "阻断", value: "手动买卖/强平" }].map((item) => <div key={item.value} className="bg-[var(--surface-low)] p-5"><item.icon size={17} className="text-[var(--terminal)]" /><div className="terminal-label mt-4 text-[0.56rem]">{item.label}</div><div className="mt-1 text-xs font-bold">{item.value}</div></div>)}
            </div>
          </section>
        </div>

        <section className="terminal-panel min-w-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4"><div><div className="terminal-label text-[var(--terminal)]">Read-only config</div><h2 className="mt-1 font-display text-sm font-bold">运行配置快照</h2></div><span className="terminal-kbd">JSON</span></div>
          <pre className="max-h-[640px] overflow-auto p-5 text-[0.68rem] leading-6 text-[var(--text-soft)]"><code>{JSON.stringify(safeConfig, null, 2)}</code></pre>
          <div className="border-t border-[var(--line-soft)] px-5 py-4 text-[0.62rem] leading-5 text-[var(--muted)]">该视图仅显示运行所需的非敏感字段；不提供配置提交、热重载或密钥查看。</div>
        </section>
      </div>

      {pending && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="w-full max-w-md border border-[var(--danger-strong)] bg-[var(--surface-low)] p-6 shadow-2xl">
            <AlertTriangle size={24} className="text-[var(--danger)]" />
            <h2 id="confirm-title" className="font-display mt-5 text-lg font-bold">确认{actionCopy[pending].title}？</h2>
            <p className="mt-3 text-xs leading-6 text-[var(--text-soft)]">{actionCopy[pending].description}</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setPending(null)}>取消</Button><Button variant="destructive" onClick={() => sendAction(pending)}>确认停止</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
