"use client";

import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, CircleDollarSign, LockKeyhole, Radar, ShieldAlert, ShieldCheck, Target, TrendingUp, WalletCards, type LucideIcon } from "lucide-react";
import useSWR from "swr";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelLoading } from "@/components/dashboard/data-state";
import { RealtimeActivityPanel } from "@/components/dashboard/realtime-activity";
import { TradeCard } from "@/components/dashboard/trade-card";
import { apiFetcher } from "@/lib/api";
import { latestPeriod } from "@/lib/freqtrade/normalizers";
import type { Balance, OpenTrade, PeriodResponse, Profit, ShowConfig } from "@/lib/freqtrade/types";
import { formatPct, formatUsd, positionRiskDistance, profitClass } from "@/lib/utils";

function Metric({ label, value, icon: Icon, tone = "default", note, lead = false }: { label: string; value: string; icon: LucideIcon; tone?: "default" | "positive" | "negative"; note?: string; lead?: boolean }) {
  return (
    <div className="group min-h-[142px] border-b border-[var(--line-soft)] p-5 transition-colors hover:bg-[rgba(0,255,65,0.018)] sm:border-r xl:border-b-0 last:border-r-0">
      <div className="flex items-center justify-between gap-3">
        <div className="terminal-label">{label}</div>
        <Icon size={16} strokeWidth={1.5} className="text-[var(--line)] transition-colors group-hover:text-[var(--terminal)]" />
      </div>
      <div className={`terminal-value mt-5 font-bold ${lead ? "text-3xl sm:text-[2.1rem]" : "text-xl sm:text-2xl"} ${tone === "positive" ? "profit-pos" : tone === "negative" ? "profit-neg" : "text-[var(--text)]"}`}>{value}</div>
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

  const requests = [balance, profit, daily, weekly, monthly, status, config];
  const loadedCount = requests.filter((request) => request.data !== undefined).length;
  const errorCount = requests.filter((request) => request.error).length;
  const isInitialLoading = loadedCount === 0 && requests.some((request) => request.isLoading);
  const openTrades = Array.isArray(status.data) ? status.data : [];
  const today = latestPeriod(daily.data);
  const thisWeek = latestPeriod(weekly.data);
  const thisMonth = latestPeriod(monthly.data);
  const totalProfit = profit.data?.profit_all_coin ?? profit.data?.profit_closed_coin;
  const totalStake = openTrades.reduce((sum, trade) => sum + (trade.stake_amount ?? 0), 0);
  const unrealizedProfit = openTrades.reduce((sum, trade) => sum + (trade.profit_abs ?? 0), 0);
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

      {errorCount > 0 ? (
        <div className="mb-5 flex items-start justify-between gap-4 border border-[rgba(255,209,102,0.28)] bg-[rgba(255,209,102,0.035)] p-4 text-xs text-[var(--warning)]" role="status">
          <span className="flex items-start gap-3"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><span><strong className="font-display">DEGRADED_DATA_MODE</strong><span className="mt-1 block leading-5 text-[var(--text-soft)]">{errorCount} 个数据源暂不可用，已保留其余实时指标；顶部刷新可重新同步。</span></span></span>
          <span className="terminal-value shrink-0">{loadedCount}/7 ONLINE</span>
        </div>
      ) : null}

      {isInitialLoading ? <div className="terminal-panel"><PanelLoading label="正在建立指标快照" /></div> : (
        <>
          <section className="terminal-panel mb-5 overflow-hidden" aria-label="账户指标">
            <div className="grid sm:grid-cols-2 xl:grid-cols-[1.35fr_repeat(3,minmax(0,1fr))]">
              <Metric lead icon={WalletCards} label="Account equity" value={formatUsd(balance.data?.total)} note={`${balance.data?.stake ?? config.data?.stake_currency ?? "USDT"} 计价 · ${loadedCount}/7 数据源`} />
              <Metric icon={TrendingUp} label="Total profit" value={formatUsd(totalProfit)} tone={(totalProfit ?? 0) >= 0 ? "positive" : "negative"} note={`${profit.data?.trade_count ?? 0} 笔交易`} />
              <Metric icon={Target} label="Win rate" value={formatPct(profit.data?.winrate)} tone={(profit.data?.winrate ?? 0) >= 0.5 ? "positive" : "default"} note={`${profit.data?.closed_trade_count ?? 0} 笔已平仓`} />
              <Metric icon={ShieldAlert} label="Max drawdown" value={formatPct(profit.data?.max_drawdown ? -Math.abs(profit.data.max_drawdown) : profit.data?.max_drawdown)} tone="negative" note="账户历史峰值回撤" />
            </div>
          </section>

          <section className="mb-5 grid gap-px border border-[var(--line-soft)] bg-[var(--line-soft)] sm:grid-cols-3" aria-label="周期收益">
            {[
              { label: "TODAY_RETURN", period: today },
              { label: "CURRENT_WEEK", period: thisWeek },
              { label: "CURRENT_MONTH", period: thisMonth },
            ].map(({ label, period }) => (
              <div key={label} className="bg-[var(--surface-low)] px-5 py-4">
                <div className="terminal-label text-[0.6rem]">{label}</div>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <div className={`terminal-value text-lg font-bold ${(period?.rel_profit ?? 0) >= 0 ? "profit-pos" : "profit-neg"}`}>{formatPct(period?.rel_profit)}</div>
                  <div className="terminal-value text-[0.65rem] text-[var(--text-soft)]">{formatUsd(period?.abs_profit)}</div>
                </div>
                <div className="mt-1 text-[0.62rem] text-[var(--muted)]">{period?.trade_count ?? 0} trades</div>
              </div>
            ))}
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="terminal-panel overflow-hidden">
              <div className="flex flex-col justify-between gap-3 border-b border-[var(--line-soft)] px-5 py-4 sm:flex-row sm:items-center">
                <div>
                  <div className="terminal-label text-[var(--terminal)]">Active positions</div>
                  <h2 className="mt-1 font-display text-sm font-bold">当前持仓矩阵</h2>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.62rem]">
                  <span className="terminal-value text-[var(--text-soft)]">{openTrades.length} POSITIONS</span>
                  <span className="terminal-value text-[var(--muted)]">{formatUsd(totalStake)} EXPOSED</span>
                  <span className={`terminal-value font-bold ${profitClass(unrealizedProfit)}`}>{formatUsd(unrealizedProfit)} FLOATING</span>
                  <Link href="/chart" className="flex min-h-9 items-center gap-2 font-bold text-[var(--muted)] hover:text-[var(--terminal)]">打开图表 <ArrowRight size={14} /></Link>
                </div>
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
                    <table className="w-full min-w-[880px] text-left text-xs">
                      <thead className="border-b border-[var(--line-soft)] bg-[var(--surface-dim)]">
                        <tr>{["PAIR", "SIDE", "ENTRY", "MARK", "STAKE", "UNREALIZED PNL", "STOP BUFFER"].map((head) => <th key={head} className="terminal-label px-4 py-3 text-[0.56rem]">{head}</th>)}</tr>
                      </thead>
                      <tbody>
                        {openTrades.map((trade) => {
                          const riskDistance = positionRiskDistance(trade.current_rate, trade.stop_loss_abs, trade.is_short);
                          return (
                            <tr key={trade.trade_id} className="border-b border-[var(--line-soft)] last:border-0 hover:bg-[rgba(0,255,65,0.025)]">
                              <td className="px-4 py-4 font-display font-bold">{trade.pair}<div className="mt-1 text-[0.56rem] font-normal text-[var(--muted)]">#{trade.trade_id}</div></td>
                              <td className={`px-4 py-4 font-bold ${trade.is_short ? "profit-neg" : "profit-pos"}`}>{trade.is_short ? "SHORT" : "LONG"}</td>
                              <td className="terminal-value px-4 py-4">{formatUsd(trade.open_rate)}</td>
                              <td className="terminal-value px-4 py-4">{formatUsd(trade.current_rate)}</td>
                              <td className="terminal-value px-4 py-4">{formatUsd(trade.stake_amount)}</td>
                              <td className={`terminal-value px-4 py-4 text-sm font-bold ${trade.profit_ratio >= 0 ? "profit-pos" : "profit-neg"}`}>{formatPct(trade.profit_ratio)}<div className="mt-1 text-[0.56rem] font-normal text-[var(--muted)]">{formatUsd(trade.profit_abs)}</div></td>
                              <td className="terminal-value px-4 py-4 text-[var(--warning)]">{formatPct(riskDistance)}<div className="mt-1 text-[0.56rem] text-[var(--muted)]">STOP {formatUsd(trade.stop_loss_abs)}</div></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid gap-3 p-3 lg:hidden">
                    {openTrades.map((trade) => <TradeCard key={trade.trade_id} pair={trade.pair} isShort={trade.is_short} openRate={trade.open_rate} currentRate={trade.current_rate} stakeAmount={trade.stake_amount} profitRatio={trade.profit_ratio} profitAbs={trade.profit_abs} stopLossRate={trade.stop_loss_abs} />)}
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
