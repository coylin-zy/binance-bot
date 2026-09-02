"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { BrainCircuit, CheckCircle2, Database, GitCommitHorizontal, Info, LockKeyhole, ShieldAlert, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelError, PanelLoading } from "@/components/dashboard/data-state";
import { Button } from "@/components/ui/button";
import { apiFetcher, postApi } from "@/lib/api";
import type { BinanceAccountSnapshot } from "@/lib/binance/client";
import type { LlmResult } from "@/lib/llm/gateway";
import type { ResearchBaseline } from "@/lib/research/baseline";
import { formatPct, formatUsd } from "@/lib/utils";

interface AuditResponse {
  events: Array<{
    decision_id: string;
    event_type: string;
    request_timestamp: string;
    result_status: string;
    payload?: { task?: string; output?: { summary?: string; risk_flags?: string[] } };
  }>;
}

interface AiStatus {
  status: "configured" | "not_configured";
  provider: string;
  model: string | null;
  read_only: boolean;
}

function pct(value: number | null) {
  return value === null ? "—" : formatPct(value);
}

function Metric({ label, value, tone = "default", note }: { label: string; value: string; tone?: "default" | "positive" | "negative" | "warning"; note: string }) {
  const color = tone === "positive" ? "profit-pos" : tone === "negative" ? "profit-neg" : tone === "warning" ? "text-[var(--warning)]" : "text-[var(--text)]";
  return <div className="border-b border-[var(--line-soft)] bg-[var(--surface-low)] p-5 sm:border-r xl:last:border-r-0"><div className="terminal-label text-[0.58rem]">{label}</div><div className={`terminal-value mt-3 text-2xl font-bold ${color}`}>{value}</div><div className="mt-2 text-[0.62rem] text-[var(--muted)]">{note}</div></div>;
}

export default function ResearchPage() {
  const baseline = useSWR<ResearchBaseline>("/api/research/baseline", apiFetcher);
  const aiStatus = useSWR<AiStatus>("/api/ai/status", apiFetcher);
  const account = useSWR<BinanceAccountSnapshot>("/api/binance/account", apiFetcher, { refreshInterval: 60_000 });
  const audit = useSWR<AuditResponse>("/api/audit?limit=20", apiFetcher);
  const [review, setReview] = useState<LlmResult | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const data = baseline.data;

  const holdoutRows = useMemo(() => data?.diagnostics.filter((row) => row.role === "holdout") ?? [], [data]);

  async function generateReview() {
    if (!data || reviewing) return;
    setReviewing(true);
    try {
      const response = await postApi<{ output: LlmResult } & LlmResult>("/api/ai/review", {
        task: "strategy_review",
        prompt_version: "strategy-review-v1",
        market_data_timestamp: "sealed-holdout-2025-h1",
        context: {
          strategy: data.strategy,
          strategy_version: data.strategy_version,
          holdout: {
            trades: data.holdout_trade_count,
            profit_total_pct: data.holdout_profit_total_pct,
            profit_factor: data.holdout_profit_factor,
          },
          diagnostics: data.diagnostics,
          exit_reasons: data.exit_reasons,
        },
      });
      setReview(response);
    } catch (error) {
      setReview({ status: "provider_error", task: "strategy_review", provider: "unknown", model: null, prompt_version: "strategy-review-v1", input_snapshot_hash: "", latency_ms: null, token_usage: null, output: null, error_code: error instanceof Error ? error.message : "request_failed" });
    } finally {
      setReviewing(false);
    }
  }

  if (baseline.error) return <div className="mx-auto max-w-[1540px]"><PageHeader eyebrow="[ RESEARCH.EVIDENCE ]" title="策略研究终端" description="冻结的研究证据与只读 AI 解读。" /><div className="terminal-panel"><PanelError /></div></div>;
  if (!data) return <div className="mx-auto max-w-[1540px]"><PageHeader eyebrow="[ RESEARCH.EVIDENCE ]" title="策略研究终端" description="冻结的研究证据与只读 AI 解读。" /><div className="terminal-panel"><PanelLoading label="正在加载策略证据" /></div></div>;

  return (
    <div className="mx-auto max-w-[1540px]">
      <PageHeader
        eyebrow="[ RESEARCH.EVIDENCE ]"
        title="策略研究终端"
        description="把 SimpleSpot 的信号来源、前瞻路径、数据血缘和 AI 解释放在同一条可复盘链路上。AI 只读，不参与交易执行。"
        actions={<div className="flex items-center gap-2 border border-[rgba(255,209,102,0.35)] bg-[rgba(255,209,102,0.06)] px-3 py-2 text-[0.65rem] font-bold text-[var(--warning)]"><LockKeyhole size={14} />RESEARCH_ONLY</div>}
      />

      <section className="mb-5 grid gap-px border border-[var(--line-soft)] bg-[var(--line-soft)] sm:grid-cols-2 xl:grid-cols-4" aria-label="研究结论摘要">
        <Metric label="HOLDOUT STATUS" value="SEALED" tone="warning" note="2025-01-01 → 2026-06-30" />
        <Metric label="HOLDOUT RETURN" value={`${data.holdout_profit_total_pct.toFixed(2)}%`} tone="negative" note="扣费前后均不构成实盘授权" />
        <Metric label="HOLDOUT TRADES" value={String(data.holdout_trade_count)} note="样本仍然稀疏" />
        <Metric label="PROFIT FACTOR" value={data.holdout_profit_factor.toFixed(2)} tone="negative" note="目标门槛 ≥ 1.05" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="terminal-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4"><div><div className="terminal-label text-[var(--terminal)]">Signal diagnostics</div><h2 className="mt-1 font-display text-sm font-bold">信号稀疏度与前瞻路径</h2></div><Database size={18} className="text-[var(--terminal)]" /></div>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[800px] text-left text-xs"><thead className="border-b border-[var(--line-soft)] bg-[var(--surface-dim)]"><tr>{["WINDOW / PAIR", "RSI >30", "EMA FILTERED", "ENTRIES", "24H NET", "MFE", "MAE"].map((head) => <th key={head} className="terminal-label px-4 py-3 text-[0.56rem]">{head}</th>)}</tr></thead><tbody>{data.diagnostics.map((row) => <tr key={`${row.role}-${row.pair}`} className="border-b border-[var(--line-soft)] last:border-0 hover:bg-[rgba(0,255,65,0.025)]"><td className="px-4 py-3 font-bold">{row.window}<div className="mt-1 text-[0.58rem] font-normal text-[var(--muted)]">{row.pair}</div></td><td className="terminal-value px-4 py-3">{row.rsi_crosses}</td><td className="terminal-value px-4 py-3">{row.ema_filtered}</td><td className="terminal-value px-4 py-3 font-bold">{row.entries}</td><td className={`terminal-value px-4 py-3 font-bold ${(row.forward_24h_net_mean ?? 0) >= 0 ? "profit-pos" : "profit-neg"}`}>{pct(row.forward_24h_net_mean)}</td><td className="terminal-value px-4 py-3 text-[var(--terminal)]">{pct(row.mfe_24h)}</td><td className="terminal-value px-4 py-3 text-[var(--danger)]">{pct(row.mae_24h)}</td></tr>)}</tbody></table></div>
            <div className="divide-y divide-[var(--line-soft)] md:hidden">{data.diagnostics.map((row) => <article key={`${row.role}-${row.pair}`} className="p-4"><div className="flex items-start justify-between gap-4"><div><div className="terminal-label text-[0.55rem]">{row.window}</div><h3 className="mt-1 font-display text-sm font-bold">{row.pair}</h3></div><span className={`terminal-value font-bold ${(row.forward_24h_net_mean ?? 0) >= 0 ? "profit-pos" : "profit-neg"}`}>{pct(row.forward_24h_net_mean)}</span></div><dl className="mt-4 grid grid-cols-3 gap-3 text-[0.65rem]"><div><dt className="terminal-label text-[0.5rem]">RSI</dt><dd className="terminal-value mt-1">{row.rsi_crosses}</dd></div><div><dt className="terminal-label text-[0.5rem]">FILTERED</dt><dd className="terminal-value mt-1">{row.ema_filtered}</dd></div><div><dt className="terminal-label text-[0.5rem]">ENTRIES</dt><dd className="terminal-value mt-1">{row.entries}</dd></div></dl></article>)}</div>
          </section>

          <section className="terminal-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4"><div><div className="terminal-label text-[var(--terminal)]">Optional account observability</div><h2 className="mt-1 font-display text-sm font-bold">Binance Global 只读账户</h2></div><ShieldAlert size={18} className="text-[var(--muted)]" /></div>
            <div className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold"><span className={`status-dot ${account.data?.status === "available" ? "text-[var(--terminal)]" : "text-[var(--warning)]"}`} />{account.data?.status?.toUpperCase() ?? "SYNCING"}</div><span className="terminal-label text-[0.52rem]">PUBLIC MARKET DATA · READ ONLY</span></div>{account.data?.status === "available" ? <><div className="mt-5 grid gap-3 sm:grid-cols-3"><div><div className="terminal-label text-[0.52rem]">CAN TRADE</div><div className="mt-1 text-xs font-bold">{account.data.can_trade ? "ENABLED" : "DISABLED"}</div></div><div><div className="terminal-label text-[0.52rem]">WITHDRAW</div><div className="mt-1 text-xs font-bold text-[var(--terminal)]">{account.data.can_withdraw ? "REVIEW" : "BLOCKED"}</div></div><div><div className="terminal-label text-[0.52rem]">LATENCY</div><div className="terminal-value mt-1 text-xs font-bold">{account.data.request_latency_ms ?? "—"} ms</div></div></div><div className="mt-5 space-y-2">{account.data.balances.length ? account.data.balances.map((balance) => <div key={balance.asset} className="flex items-center justify-between border-t border-[var(--line-soft)] pt-2 text-xs"><span className="font-bold">{balance.asset}</span><span className="terminal-value text-[var(--text-soft)]">{balance.total.toFixed(8)}</span></div>) : <div className="text-[0.65rem] text-[var(--muted)]">账户没有非零余额。</div>}</div></> : <p className="mt-4 text-[0.67rem] leading-5 text-[var(--muted)]">{account.data?.status === "not_configured" ? "未配置只读 Key。研究行情、Freqtrade dry-run 和模拟余额不受影响。" : "账户 API 暂不可用；这只影响可选观测，不影响机器人研究运行。"}</p>}</div>
          </section>

          <section className="terminal-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4"><div><div className="terminal-label text-[var(--terminal)]">Forward gate</div><h2 className="mt-1 font-display text-sm font-bold">Dry-run acceptance v1</h2></div><ShieldAlert size={18} className="text-[var(--warning)]" /></div>
            <div className="grid gap-px bg-[var(--line-soft)] sm:grid-cols-2">{[["最低交易样本", `${data.acceptance.min_trade_count}`], ["最低 Profit Factor", data.acceptance.min_profit_factor.toFixed(2)], ["最大回撤", formatPct(data.acceptance.max_drawdown_ratio)], ["最低费后净收益", formatPct(data.acceptance.min_net_return_ratio)], ["信号差异上限", formatPct(data.acceptance.max_signal_divergence_ratio)], ["最小在线率", formatPct(data.acceptance.min_uptime_ratio)]].map(([label, value]) => <div key={label} className="bg-[var(--surface-low)] p-4"><div className="terminal-label text-[0.54rem]">{label}</div><div className="terminal-value mt-2 text-sm font-bold">{value}</div></div>)}</div>
            <div className="border-t border-[var(--line-soft)] px-5 py-4 text-[0.65rem] leading-5 text-[var(--muted)]"><Info size={14} className="mr-2 inline text-[var(--warning)]" />标准已冻结。通过只代表 forward-test 满足研究门槛，不代表实盘授权。</div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="terminal-panel overflow-hidden">
            <div className="border-b border-[var(--line-soft)] px-5 py-4"><div className="terminal-label text-[var(--terminal)]">Read-only AI gateway</div><h2 className="mt-1 font-display text-sm font-bold">策略复盘</h2></div>
            <div className="p-5"><div className="flex items-start gap-3"><BrainCircuit size={20} className="mt-0.5 text-[var(--terminal)]" /><div className="min-w-0 flex-1"><div className="terminal-label text-[0.55rem]">PROVIDER STATUS</div><div className="mt-1 text-sm font-bold">{aiStatus.data?.status === "configured" ? "CONFIGURED" : "NOT_CONFIGURED"}</div><div className="mt-1 text-[0.62rem] text-[var(--muted)]">{aiStatus.data?.provider ?? "none"}{aiStatus.data?.model ? ` · ${aiStatus.data.model}` : ""}</div></div></div><p className="mt-4 text-[0.67rem] leading-5 text-[var(--text-soft)]">只允许生成研究总结、证据和风险标签；响应不会写入策略，也不能触发订单。</p><Button className="mt-5 w-full" variant="outline" onClick={() => void generateReview()} disabled={reviewing || aiStatus.data?.status !== "configured"}><Sparkles size={15} />{reviewing ? "正在生成复盘" : "生成只读策略复盘"}</Button>{aiStatus.data?.status !== "configured" && <div className="mt-3 border border-[rgba(255,209,102,0.28)] bg-[rgba(255,209,102,0.04)] p-3 text-[0.62rem] leading-5 text-[var(--warning)]">LLM 未配置。设置服务端 `LLM_PROVIDER`、`LLM_API_KEY` 和 `LLM_MODEL` 后才会启用。</div>}{review && <div className="mt-5 border-t border-[var(--line-soft)] pt-4" role="status"><div className="terminal-label text-[0.54rem]">RESULT · {review.status.toUpperCase()}</div>{review.output ? <><p className="mt-2 text-xs leading-5 text-[var(--text-soft)]">{review.output.summary}</p><div className="mt-3 flex flex-wrap gap-2">{review.output.risk_flags.map((flag) => <span key={flag} className="border border-[rgba(255,209,102,0.28)] px-2 py-1 text-[0.56rem] text-[var(--warning)]">{flag}</span>)}</div></> : <p className="mt-2 text-[0.65rem] leading-5 text-[var(--muted)]">当前没有可用的模型响应，机器人和研究数据不受影响。</p>}</div>}</div>
          </section>

          <section className="terminal-panel overflow-hidden">
            <div className="border-b border-[var(--line-soft)] px-5 py-4"><div className="terminal-label text-[var(--terminal)]">Data lineage</div><h2 className="mt-1 font-display text-sm font-bold">证据来源</h2></div>
            <dl className="divide-y divide-[var(--line-soft)] px-5">{[[GitCommitHorizontal, "GIT SHA", data.lineage.git_sha], [GitCommitHorizontal, "STRATEGY SHA", data.lineage.strategy_sha], [Database, "EXPERIMENT", data.lineage.experiment_id], [LockKeyhole, "PROTOCOL", data.lineage.protocol_version]].map(([Icon, label, value]) => <div key={String(label)} className="flex gap-3 py-4"><Icon size={15} className="mt-0.5 shrink-0 text-[var(--muted)]" /><div className="min-w-0"><dt className="terminal-label text-[0.52rem]">{String(label)}</dt><dd className="mt-1 truncate font-mono text-[0.62rem] text-[var(--text-soft)]">{String(value)}</dd></div></div>)}</dl>
          </section>

          <section className="terminal-panel overflow-hidden">
            <div className="border-b border-[var(--line-soft)] px-5 py-4"><div className="terminal-label text-[var(--terminal)]">Decision audit</div><h2 className="mt-1 font-display text-sm font-bold">最近研究事件</h2></div>{audit.data?.events?.length ? <div className="divide-y divide-[var(--line-soft)]">{audit.data.events.slice(0, 6).map((event) => <div key={event.decision_id} className="p-4"><div className="flex items-center justify-between gap-3"><span className="terminal-label text-[0.5rem]">{event.payload?.task ?? event.event_type}</span><span className="text-[0.55rem] text-[var(--muted)]">{event.result_status}</span></div><div className="mt-2 text-[0.62rem] text-[var(--muted)]">{new Date(event.request_timestamp).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</div></div>)}</div> : <div className="p-5 text-[0.65rem] leading-5 text-[var(--muted)]"><CheckCircle2 size={15} className="mr-2 inline text-[var(--terminal)]" />尚无 AI 研究事件。规则策略不会因为 AI 未配置而降级。</div>}</section>
        </aside>
      </div>

      <section className="mt-5 border border-[rgba(255,180,171,0.3)] bg-[rgba(147,0,10,0.1)] p-4 text-[0.68rem] leading-5 text-[var(--danger)]"><Info size={15} className="mr-2 inline" />当前结论：`SimpleSpot` 仍是研究策略。Sealed holdout 样本少且收益为负，禁止把这页的 AI 解读或回测结果理解为实盘批准。</section>
      <div className="sr-only">Holdout rows: {holdoutRows.length}</div>
    </div>
  );
}
