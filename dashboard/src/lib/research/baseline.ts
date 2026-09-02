import type { RuntimeLineage } from "@/lib/audit/lineage";
import { runtimeLineage } from "@/lib/audit/lineage";

export interface DiagnosticRow {
  window: string;
  role: "development" | "validation" | "holdout";
  pair: string;
  rsi_crosses: number;
  ema_filtered: number;
  entries: number;
  forward_24h_net_mean: number | null;
  mfe_24h: number | null;
  mae_24h: number | null;
}

export interface AcceptanceCriteria {
  min_trade_count: number;
  min_profit_factor: number;
  max_drawdown_ratio: number;
  min_net_return_ratio: number;
  max_single_pair_pnl_contribution_ratio: number;
  max_consecutive_losses: number;
  max_signal_divergence_ratio: number;
  max_fill_deviation_ratio: number;
  min_uptime_ratio: number;
  max_api_error_ratio: number;
  require_restart_recovery: boolean;
  require_data_integrity: boolean;
}

export interface ResearchBaseline {
  status: "research_only";
  strategy: string;
  strategy_version: string;
  exchange: string;
  timeframe: string;
  fee_ratio_per_side: number;
  holdout_status: "sealed";
  holdout_trade_count: number;
  holdout_profit_total_pct: number;
  holdout_profit_factor: number;
  diagnostics: DiagnosticRow[];
  exit_reasons: Array<{ window: string; reason: string; trades: number; fee_drag_usdt: number }>;
  acceptance: AcceptanceCriteria;
  lineage: RuntimeLineage;
  source_note: string;
}

const diagnostics: DiagnosticRow[] = [
  { window: "Development", role: "development", pair: "BTC/USDT", rsi_crosses: 284, ema_filtered: 284, entries: 0, forward_24h_net_mean: null, mfe_24h: null, mae_24h: null },
  { window: "Development", role: "development", pair: "ETH/USDT", rsi_crosses: 319, ema_filtered: 319, entries: 0, forward_24h_net_mean: null, mfe_24h: null, mae_24h: null },
  { window: "Development", role: "development", pair: "XRP/USDT", rsi_crosses: 376, ema_filtered: 375, entries: 1, forward_24h_net_mean: -0.03056, mfe_24h: 0.02, mae_24h: -0.0383 },
  { window: "Validation", role: "validation", pair: "BTC/USDT", rsi_crosses: 306, ema_filtered: 306, entries: 0, forward_24h_net_mean: null, mfe_24h: null, mae_24h: null },
  { window: "Validation", role: "validation", pair: "ETH/USDT", rsi_crosses: 349, ema_filtered: 348, entries: 1, forward_24h_net_mean: 0.00129, mfe_24h: 0.0403, mae_24h: -0.0148 },
  { window: "Validation", role: "validation", pair: "XRP/USDT", rsi_crosses: 360, ema_filtered: 359, entries: 1, forward_24h_net_mean: -0.05872, mfe_24h: 0.0373, mae_24h: -0.0593 },
  { window: "Sealed holdout", role: "holdout", pair: "BTC/USDT", rsi_crosses: 2059, ema_filtered: 2056, entries: 3, forward_24h_net_mean: -0.014, mfe_24h: 0.0113, mae_24h: -0.0233 },
  { window: "Sealed holdout", role: "holdout", pair: "ETH/USDT", rsi_crosses: 2008, ema_filtered: 2005, entries: 3, forward_24h_net_mean: -0.0152, mfe_24h: 0.0141, mae_24h: -0.0235 },
  { window: "Sealed holdout", role: "holdout", pair: "XRP/USDT", rsi_crosses: 2159, ema_filtered: 2158, entries: 1, forward_24h_net_mean: 0.0155, mfe_24h: 0.026, mae_24h: -0.0275 },
];

const acceptance: AcceptanceCriteria = {
  min_trade_count: 30,
  min_profit_factor: 1.05,
  max_drawdown_ratio: 0.1,
  min_net_return_ratio: 0,
  max_single_pair_pnl_contribution_ratio: 0.75,
  max_consecutive_losses: 6,
  max_signal_divergence_ratio: 0.05,
  max_fill_deviation_ratio: 0.0025,
  min_uptime_ratio: 0.99,
  max_api_error_ratio: 0.01,
  require_restart_recovery: true,
  require_data_integrity: true,
};

export function getResearchBaseline(): ResearchBaseline {
  return {
    status: "research_only",
    strategy: "SimpleSpot",
    strategy_version: "SimpleSpot-v1",
    exchange: "binance",
    timeframe: "5m",
    fee_ratio_per_side: 0.001,
    holdout_status: "sealed",
    holdout_trade_count: 7,
    holdout_profit_total_pct: -2.59,
    holdout_profit_factor: 0.27,
    diagnostics,
    exit_reasons: [
      { window: "Development", reason: "roi", trades: 1, fee_drag_usdt: 0.019957 },
      { window: "Validation", reason: "roi", trades: 1, fee_drag_usdt: 0.020039 },
      { window: "Validation", reason: "trailing_stop_loss", trades: 1, fee_drag_usdt: 0.020039 },
      { window: "Sealed holdout", reason: "exit_signal", trades: 7, fee_drag_usdt: 0.135251 },
    ],
    acceptance,
    lineage: runtimeLineage(),
    source_note: "Diagnostics are computed from the locked strategy_validation snapshots. The holdout is sealed and remains research-only.",
  };
}
