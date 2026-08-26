import type {
  DailyPnl,
  PeriodResponse,
  TradeHistoryItem,
  TradeHistoryResponse,
} from "./types";

export function periodRows(response?: PeriodResponse | DailyPnl[] | null): DailyPnl[] {
  if (!response) return [];
  return Array.isArray(response) ? response : response.data ?? [];
}

export function latestPeriod(response?: PeriodResponse | DailyPnl[] | null): DailyPnl | undefined {
  return periodRows(response)[0];
}

export function tradeRows(
  response?: TradeHistoryResponse | TradeHistoryItem[] | null,
): TradeHistoryItem[] {
  if (!response) return [];
  return Array.isArray(response) ? response : response.trades ?? [];
}

export function tradeProfitRatio(trade: Pick<TradeHistoryItem, "profit_ratio" | "close_profit">): number {
  return trade.profit_ratio ?? trade.close_profit ?? 0;
}
