"use client";

import Link from "next/link";
import { Activity, ArrowRight, CircleDollarSign, LockKeyhole, Radar, ShieldCheck } from "lucide-react";
import useSWR from "swr";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelError, PanelLoading } from "@/components/dashboard/data-state";
import { RealtimeActivityPanel } from "@/components/dashboard/realtime-activity";
import { TradeCard } from "@/components/dashboard/trade-card";
import { apiFetcher } from "@/lib/api";
import { latestPeriod } from "@/lib/freqtrade/normalizers";
import type { Balance, OpenTrade, PeriodResponse, Profit, ShowConfig } from "@/lib/freqtrade/types";
import { formatPct, formatUsd } from "@/lib/utils";

function Metric({ label, value, tone = "default", note }: { label: string; value: string; tone?: "default" | "positive" | "negative"; note?: string }) {
  return (
    <div className="min-h-[124px] border-b border-[var(--line-soft)] p-5 sm:border-b-0 sm:border-r last:border-r-0">
      <div className="terminal-label">{label}</div>
      <div className={`terminal-value mt-4 text-xl font-bold sm:text-2xl ${tone === "positive" ? "profit-pos" : tone === "negative" ? "profit-neg" : "text-[var(--text)]"}`}>{value}</div>
      {note && <div className="mt-2 text-[0.65rem] text-[var(--muted)]">{note}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const swrOptions = { refreshInterval: 30_000, revalidateOnFocus: true };
  const balance = useSWR<Balance>("/api/ft/balance", apiFetcher, swrOptions);
  const profit = useSWR<Profit>("/api/ft/profit", apiFetcher, swrOptions);
  const daily = useSWR<PeriodResponse>("/api/ft/daily", apiFetcher, swrOptions);
  const weekly = useSWR<PeriodResponse>("/api/ft/weekly", apiFetcher, swrOptions);
  const monthly = useSWR<PeriodResponse>("/api/ft/monthly", apiFetcher, swrOptions);
  const status = useSWR<OpenTrade[]>("/api/ft/status", apiFetcher, swrOptions);
  const config = useSWR<ShowConfig>("/api/ft/show_config", apiFetcher, swrOptions);

  const isLoading = [balance, profit, daily, weekly, monthly, status, config].some((request) => request.isLoading);
  const hasError = [balance, profit, daily, weekly, monthly, status, config].some((request) => request.error);
  const openTrades = Array.isArray(status.data) ? status.data : [];
  const today = latestPeriod(daily.data);
  const thisWeek = latestPeriod(weekly.data);
  const thisMonth = latestPeriod(monthly.data);
  const totalProfit = profit.data?.profit_all_coin ?? profit.data?.profit_closed_coin;
  const state = config.data?.state?.toUpperCase() ?? "UNKNOWN";
  const stateColor = state === "RUNNING" ? "var(--terminal)" : state === "PAUSED" ? "var(--warning)" : "var(--danger)";

  return (
    <div className="mx-auto max-w-[1540px]">
      <PageHeader
        eyebrow="[ SYS.DASHBOARD_OVERVIEW ]"
        title="量化机器人控制台"
        description="聚合账户、策略与持仓状态。所有数据经服务端 BFF 读取，浏览器不直接接触 Freqtrade 凭据。"
        actions={
          <div className="flex items-center gap-2 border border-[var(--line-soft)] bg-[var(--surface-low)] px-3 py-2 text-[0.68rem]" style={{ color: stateColor }}>
            <span className="status-dot" />
            <span className="font-bold tracking-[0.08em]">BOT_{state}</span>
          </div>
        }
      />

      {hasError ? <div className="terminal-panel"><PanelError /></div> : isLoading ? <div className="terminal-panel"><PanelLoading label="正在建立指标快照" /></div> : (
        <>
          <section className="terminal-panel mb-5 overflow-hidden" aria-label="账户指标">
            <div className="grid sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Account equity" value={formatUsd(balance.data?.total)} note={`${balance.data?.stake ?? config.data?.stake_currency ?? "USDT"} 计价`} />
              <Metric label="Total profit" value={formatUsd(totalProfit)} tone={(totalProfit ?? 0) >= 0 ? "positive" : "negative"} note={`${profit.data?.trade_count ?? 0} 笔交易`} />
              <Metric label="Win rate" value={formatPct(profit.data?.winrate)} tone={(profit.data?.winrate ?? 0) >= 0.5 ? "positive" : "default"} note={`${profit.data?.closed_trade_count ?? 0} 笔已平仓`} />
              <Metric label="Max drawdown" value={formatPct(profit.data?.max_drawdown ? -Math.abs(profit.data.max_drawdown) : profit.data?.max_drawdown)} tone="negative" note="账户历史峰值回撤" />
            </div>
          </section>

          <section className="mb-5 grid gap-px border border-[var(--line-soft)] bg-[var(--line-soft)] sm:grid-cols-3" aria-label="周期收益">
            {[
              ["TODAY_RETURN", today?.rel_profit, `${today?.trade_count ?? 0} trades`],
              ["CURRENT_WEEK", thisWeek?.rel_profit, `${thisWeek?.trade_count ?? 0} trades`],
              ["CURRENT_MONTH", thisMonth?.rel_profit, `${thisMonth?.trade_count ?? 0} trades`],
            ].map(([label, value, note]) => (
              <div key={String(label)} className="bg-[var(--surface-low)] px-5 py-4">
                <div className="terminal-label text-[0.6rem]">{label}</div>
                <div className={`terminal-value mt-2 text-lg font-bold ${(Number(value) || 0) >= 0 ? "profit-pos" : "profit-neg"}`}>{formatPct(value as number | undefined)}</div>
                <div className="mt-1 text-[0.62rem] text-[var(--muted)]">{note}</div>
              </div>
            ))}
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="terminal-panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4">
                <div>
                  <div className="terminal-label text-[var(--terminal)]">Active positions</div>
                  <h2 className="mt-1 font-display text-sm font-bold">当前持仓矩阵</h2>
                </div>
                <Link href="/chart" className="flex min-h-11 items-center gap-2 text-[0.68rem] font-bold text-[var(--muted)] hover:text-[var(--terminal)]">
                  打开图表 <ArrowRight size={14} />
                </Link>
              </div>

              {openTrades.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                  <Radar size={30} strokeWidth={1.2} className="mb-4 text-[var(--terminal)]" />
                  <div className="font-display text-sm font-bold">WAITING_FOR_STRATEGY_SIGNAL</div>
                  <p className="mt-2 max-w-md text-xs leading-5 text-[var(--muted)]">当前没有未平仓交易。机器人会按策略与风控配置继续扫描白名单。</p>
                </div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full min-w-[720px] text-left text-xs">
                      <thead className="border-b border-[var(--line-soft)] bg-[var(--surface-dim)]">
                        <tr>{["PAIR", "SIDE", "ENTRY", "MARK", "STAKE", "UNREALIZED PNL"].map((head) => <th key={head} className="terminal-label px-5 py-3 text-[0.58rem]">{head}</th>)}</tr>
                      </thead>
                      <tbody>
                        {openTrades.map((trade) => (
                          <tr key={trade.trade_id} className="border-b border-[var(--line-soft)] last:border-0 hover:bg-[rgba(0,255,65,0.025)]">
                            <td className="px-5 py-4 font-display font-bold">{trade.pair}</td>
                            <td className={`px-5 py-4 font-bold ${trade.is_short ? "profit-neg" : "profit-pos"}`}>{trade.is_short ? "SHORT" : "LONG"}</td>
                            <td className="terminal-value px-5 py-4">{formatUsd(trade.open_rate)}</td>
                            <td className="terminal-value px-5 py-4">{formatUsd(trade.current_rate)}</td>
                            <td className="terminal-value px-5 py-4">{formatUsd(trade.stake_amount)}</td>
                            <td className={`terminal-value px-5 py-4 text-sm font-bold ${trade.profit_ratio >= 0 ? "profit-pos" : "profit-neg"}`}>{formatPct(trade.profit_ratio)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid gap-3 p-3 lg:hidden">
                    {openTrades.map((trade) => <TradeCard key={trade.trade_id} pair={trade.pair} isShort={trade.is_short} openRate={trade.open_rate} currentRate={trade.current_rate} profitRatio={trade.profit_ratio} />)}
                  </div>
                </>
              )}
            </section>

            <div className="space-y-5">
              <aside className="terminal-panel overflow-hidden" aria-label="系统状态">
                <div className="border-b border-[var(--line-soft)] px-5 py-4">
                  <div className="terminal-label text-[var(--terminal)]">System telemetry</div>
                  <h2 className="mt-1 font-display text-sm font-bold">运行状态</h2>
                </div>
                <div className="divide-y divide-[var(--line-soft)] px-5">
                  {[
                    { icon: Activity, label: "BOT STATE", value: state, color: stateColor },
                    { icon: CircleDollarSign, label: "EXECUTION MODE", value: config.data?.dry_run ? "DRY-RUN / SPOT" : "LIVE / CHECK", color: config.data?.dry_run ? "var(--warning)" : "var(--danger)" },
                    { icon: Radar, label: "STRATEGY", value: config.data?.strategy ?? "--", color: "var(--text)" },
                    { icon: ShieldCheck, label: "TIMEFRAME", value: config.data?.timeframe ?? "--", color: "var(--text)" },
                    { icon: LockKeyhole, label: "MANUAL TRADING", value: "SERVER BLOCKED", color: "var(--terminal)" },
                  ].map((item) => (
                    <div key={item.label} className="flex gap-3 py-4">
                      <item.icon size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[var(--muted)]" />
                      <div className="min-w-0">
                        <div className="terminal-label text-[0.56rem]">{item.label}</div>
                        <div className="mt-1 truncate text-[0.7rem] font-bold" style={{ color: item.color }}>{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/settings" className="flex min-h-12 items-center justify-between border-t border-[var(--line-soft)] px-5 text-[0.68rem] font-bold text-[var(--text-soft)] hover:bg-[var(--surface-high)] hover:text-[var(--terminal)]">
                  进入运行控制 <ArrowRight size={15} />
                </Link>
              </aside>
              <RealtimeActivityPanel />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
