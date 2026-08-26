"use client";

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import useSWR from "swr";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelError, PanelLoading } from "@/components/dashboard/data-state";
import { ProfitCurve } from "@/components/dashboard/profit-curve";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetcher } from "@/lib/api";
import { tradeProfitRatio, tradeRows } from "@/lib/freqtrade/normalizers";
import type { TradeHistoryResponse } from "@/lib/freqtrade/types";
import { formatPct, formatUsd } from "@/lib/utils";

type Range = "7d" | "30d" | "all";

function escapeCsv(value: unknown) {
  const valueText = String(value ?? "");
  return `"${valueText.replaceAll('"', '""')}"`;
}

export default function TradesPage() {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<Range>("30d");
  const request = useSWR<TradeHistoryResponse>("/api/ft/trades?limit=500", apiFetcher, { refreshInterval: 30_000 });
  const trades = useMemo(() => tradeRows(request.data), [request.data]);

  const rangedTrades = useMemo(() => {
    if (range === "all") return trades;
    const days = range === "7d" ? 7 : 30;
    const cutoff = Date.now() - days * 86_400_000;
    return trades.filter((trade) => new Date(trade.close_date ?? trade.open_date).getTime() >= cutoff);
  }, [range, trades]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rangedTrades;
    return rangedTrades.filter((trade) =>
      trade.pair.toLowerCase().includes(normalized)
      || trade.exit_reason?.toLowerCase().includes(normalized)
      || String(trade.trade_id) === normalized,
    );
  }, [query, rangedTrades]);

  const closed = rangedTrades.filter((trade) => !trade.is_open);
  const totalAbs = closed.reduce((sum, trade) => sum + (trade.profit_abs ?? 0), 0);
  const wins = closed.filter((trade) => tradeProfitRatio(trade) > 0).length;
  const winrate = closed.length ? wins / closed.length : 0;

  function downloadCsv() {
    const headers = ["trade_id", "pair", "side", "open_rate", "close_rate", "profit_ratio", "profit_abs", "open_date", "close_date", "exit_reason"];
    const lines = [headers.join(","), ...filtered.map((trade) => [
      trade.trade_id, trade.pair, trade.is_short ? "short" : "long", trade.open_rate,
      trade.close_rate, tradeProfitRatio(trade), trade.profit_abs, trade.open_date,
      trade.close_date, trade.exit_reason,
    ].map(escapeCsv).join(","))];
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `freqtrade-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[1540px]">
      <PageHeader
        eyebrow="[ TRADE.HISTORY_ANALYTICS ]"
        title="收益分析与执行记录"
        description="将 Freqtrade 的真实交易响应标准化为可筛选、可导出的执行审计视图。收益百分比统一按 ratio 单位显示。"
        actions={<Button variant="outline" onClick={downloadCsv} disabled={filtered.length === 0}><Download size={15} />导出 CSV</Button>}
      />

      {request.error ? <div className="terminal-panel"><PanelError /></div> : request.isLoading ? <div className="terminal-panel"><PanelLoading label="正在读取交易历史" /></div> : (
        <>
          <section className="mb-5 grid gap-px border border-[var(--line-soft)] bg-[var(--line-soft)] sm:grid-cols-3" aria-label="交易统计">
            {[
              ["REALIZED_PNL", formatUsd(totalAbs), totalAbs >= 0 ? "profit-pos" : "profit-neg"],
              ["WIN_RATE", formatPct(winrate), winrate >= 0.5 ? "profit-pos" : ""],
              ["EXECUTIONS", String(closed.length), ""],
            ].map(([label, value, tone]) => (
              <div key={label} className="bg-[var(--surface-low)] p-5">
                <div className="terminal-label">{label}</div>
                <div className={`terminal-value mt-3 text-2xl font-bold ${tone}`}>{value}</div>
              </div>
            ))}
          </section>

          <section className="terminal-panel mb-5 overflow-hidden">
            <div className="flex flex-col justify-between gap-4 border-b border-[var(--line-soft)] px-5 py-4 sm:flex-row sm:items-center">
              <div><div className="terminal-label text-[var(--terminal)]">Cumulative profit curve</div><h2 className="mt-1 font-display text-sm font-bold">累计已实现收益</h2></div>
              <div className="flex border border-[var(--line)]" role="group" aria-label="收益曲线时间范围">
                {(["7d", "30d", "all"] as Range[]).map((value) => (
                  <button key={value} type="button" onClick={() => setRange(value)} className={`min-h-11 border-r border-[var(--line)] px-4 text-[0.65rem] font-bold uppercase last:border-r-0 ${range === value ? "bg-[var(--terminal)] text-[var(--terminal-ink)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`} aria-pressed={range === value}>
                    {value === "all" ? "全部" : value}
                  </button>
                ))}
              </div>
            </div>
            <ProfitCurve trades={rangedTrades} />
          </section>

          <section className="terminal-panel overflow-hidden">
            <div className="flex flex-col justify-between gap-4 border-b border-[var(--line-soft)] px-5 py-4 lg:flex-row lg:items-center">
              <div><div className="terminal-label text-[var(--terminal)]">Execution log</div><h2 className="mt-1 font-display text-sm font-bold">交易执行记录</h2></div>
              <label className="relative block w-full lg:w-[340px]">
                <span className="sr-only">筛选交易</span>
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索币对 / 出场原因 / ID" className="pl-9" />
              </label>
            </div>

            {filtered.length === 0 ? (
              <div className="flex min-h-44 items-center justify-center px-5 text-center text-xs text-[var(--muted)]">当前范围没有匹配的交易记录</div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[860px] text-left text-xs">
                    <thead className="border-b border-[var(--line-soft)] bg-[var(--surface-dim)]">
                      <tr>{["ID / PAIR", "SIDE", "ENTRY", "EXIT", "PNL", "REASON", "OPENED"].map((head) => <th key={head} className="terminal-label px-4 py-3 text-[0.57rem]">{head}</th>)}</tr>
                    </thead>
                    <tbody>
                      {filtered.map((trade) => {
                        const ratio = tradeProfitRatio(trade);
                        return (
                          <tr key={trade.trade_id} className="border-b border-[var(--line-soft)] last:border-0 hover:bg-[rgba(0,255,65,0.025)]">
                            <td className="px-4 py-4"><span className="text-[0.6rem] text-[var(--muted)]">#{trade.trade_id}</span><div className="mt-1 font-display font-bold">{trade.pair}</div></td>
                            <td className={`px-4 py-4 font-bold ${trade.is_short ? "profit-neg" : "profit-pos"}`}>{trade.is_short ? "SHORT" : "LONG"}</td>
                            <td className="terminal-value px-4 py-4">{formatUsd(trade.open_rate)}</td>
                            <td className="terminal-value px-4 py-4">{formatUsd(trade.close_rate)}</td>
                            <td className={`terminal-value px-4 py-4 font-bold ${ratio >= 0 ? "profit-pos" : "profit-neg"}`}>{formatPct(ratio)}<div className="mt-1 text-[0.58rem] text-[var(--muted)]">{formatUsd(trade.profit_abs)}</div></td>
                            <td className="max-w-44 truncate px-4 py-4 text-[var(--text-soft)]">{trade.exit_reason ?? (trade.is_open ? "OPEN" : "--")}</td>
                            <td className="px-4 py-4 text-[0.65rem] text-[var(--muted)]">{new Date(trade.open_date).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-[var(--line-soft)] md:hidden">
                  {filtered.map((trade) => {
                    const ratio = tradeProfitRatio(trade);
                    return (
                      <article key={trade.trade_id} className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div><div className="text-[0.58rem] text-[var(--muted)]">EXECUTION #{trade.trade_id}</div><h3 className="mt-1 font-display text-sm font-bold">{trade.pair}</h3></div>
                          <div className={`terminal-value text-base font-bold ${ratio >= 0 ? "profit-pos" : "profit-neg"}`}>{formatPct(ratio)}</div>
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-4 text-xs">
                          <div><dt className="terminal-label text-[0.56rem]">Side</dt><dd className={`mt-1 font-bold ${trade.is_short ? "profit-neg" : "profit-pos"}`}>{trade.is_short ? "SHORT" : "LONG"}</dd></div>
                          <div className="text-right"><dt className="terminal-label text-[0.56rem]">Pnl abs</dt><dd className="terminal-value mt-1">{formatUsd(trade.profit_abs)}</dd></div>
                          <div><dt className="terminal-label text-[0.56rem]">Entry</dt><dd className="terminal-value mt-1">{formatUsd(trade.open_rate)}</dd></div>
                          <div className="text-right"><dt className="terminal-label text-[0.56rem]">Exit</dt><dd className="terminal-value mt-1">{formatUsd(trade.close_rate)}</dd></div>
                        </dl>
                        <div className="mt-4 border-t border-[var(--line-soft)] pt-3 text-[0.65rem] text-[var(--muted)]">{trade.exit_reason ?? (trade.is_open ? "持仓中" : "--")} · {new Date(trade.open_date).toLocaleDateString("zh-CN")}</div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
