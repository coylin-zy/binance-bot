import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatPct, formatUsd, positionRiskDistance } from "@/lib/utils";

interface TradeCardProps {
  pair: string;
  isShort: boolean;
  openRate: number;
  currentRate: number;
  stakeAmount: number;
  profitRatio: number;
  profitAbs: number;
  stopLossRate: number;
}

export function TradeCard({ pair, isShort, openRate, currentRate, stakeAmount, profitRatio, profitAbs, stopLossRate }: TradeCardProps) {
  const positive = profitRatio >= 0;
  const riskDistance = positionRiskDistance(currentRate, stopLossRate, isShort);

  return (
    <article className="terminal-panel p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="terminal-label mb-1">Active position</div>
          <h3 className="font-display text-sm font-bold text-[var(--text)]">{pair}</h3>
        </div>
        <span className={isShort ? "flex items-center gap-1 text-xs text-[var(--danger)]" : "flex items-center gap-1 text-xs text-[var(--terminal)]"}>
          {isShort ? <ArrowDownRight size={15} /> : <ArrowUpRight size={15} />}
          {isShort ? "SHORT" : "LONG"}
        </span>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--line-soft)] pt-4">
        <div><dt className="terminal-label text-[0.58rem]">Entry</dt><dd className="terminal-value mt-1 text-xs">{formatUsd(openRate)}</dd></div>
        <div className="text-right"><dt className="terminal-label text-[0.58rem]">Mark</dt><dd className="terminal-value mt-1 text-xs">{formatUsd(currentRate)}</dd></div>
        <div><dt className="terminal-label text-[0.58rem]">Stake</dt><dd className="terminal-value mt-1 text-xs">{formatUsd(stakeAmount)}</dd></div>
        <div className="text-right"><dt className="terminal-label text-[0.58rem]">Stop buffer</dt><dd className="terminal-value mt-1 text-xs text-[var(--warning)]">{formatPct(riskDistance)}</dd></div>
        <div className="col-span-2 flex items-end justify-between border-t border-[var(--line-soft)] pt-4"><dt className="terminal-label text-[0.58rem]">Unrealized PnL</dt><dd className={`terminal-value text-right text-lg font-bold ${positive ? "profit-pos" : "profit-neg"}`}>{formatPct(profitRatio)}<span className="mt-1 block text-[0.6rem] font-normal text-[var(--muted)]">{formatUsd(profitAbs)}</span></dd></div>
      </dl>
    </article>
  );
}
