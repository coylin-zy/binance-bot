export interface Balance {
  currencies: Array<{
    currency: string;
    free: number;
    balance: number;
    used: number;
    est_stake: number;
    stake: string;
  }>;
  total: number;
  total_bot: number;
  symbol: string;
  value: number;
  stake: string;
  note: string;
}

export interface Profit {
  profit_closed_coin: number;
  profit_closed_percent_mean: number;
  profit_closed_ratio_mean: number;
  profit_closed_percent_sum: number;
  profit_closed_ratio_sum: number;
  profit_closed_percent: number;
  profit_closed_ratio: number;
  profit_closed_fiat: number;
  trade_count_closed_profit: number;
  profit_all_coin: number;
  profit_all_percent_mean: number;
  profit_all_ratio_mean: number;
  profit_all_percent_sum: number;
  profit_all_ratio_sum: number;
  profit_all_percent: number;
  profit_all_ratio: number;
  profit_all_fiat: number;
  trade_count_closed_loss: number;
  winrate: number;
  trade_count: number;
  closed_trade_count: number;
  first_trade_date: string;
  latest_trade_date: string;
  avg_duration: string;
  best_pair: string;
  best_pair_profit_ratio: number;
  best_pair_profit_percent: number;
  best_pair_profit_coin: number;
  max_drawdown: number;
  max_drawdown_abs: number;
  trading_volume: number;
  bot_name: string;
}

export interface DailyPnl {
  date: string;
  abs_profit: number;
  rel_profit: number;
  starting_balance: number;
  rel_profit_close: number;
  abs_profit_close: number;
  trade_count: number;
}

export interface PeriodResponse {
  data: DailyPnl[];
}

export interface OpenTrade {
  trade_id: number;
  pair: string;
  is_open: boolean;
  is_short: boolean;
  open_rate: number;
  close_rate: number | null;
  current_rate: number;
  amount: number;
  stake_amount: number;
  close_profit: number | null;
  profit_ratio: number;
  profit_pct: number;
  profit_abs: number;
  open_date: string;
  close_date: string | null;
  exit_reason: string | null;
  enter_tag: string | null;
  stop_loss_abs: number;
  stop_loss_ratio: number;
}

export interface TradeHistoryItem {
  trade_id: number;
  pair: string;
  is_open: boolean;
  is_short: boolean;
  open_rate: number;
  close_rate: number | null;
  amount: number;
  stake_amount: number;
  close_profit: number | null;
  profit_ratio: number;
  profit_pct: number;
  profit_abs: number;
  open_date: string;
  close_date: string | null;
  exit_reason: string | null;
  enter_tag: string | null;
}

export interface TradeHistoryResponse {
  trades: TradeHistoryItem[];
  trades_count: number;
  total_trades: number;
  offset: number;
}

export interface ShowConfig {
  dry_run: boolean;
  trading_mode: string;
  strategy: string;
  strategy_version?: string;
  timeframe: string;
  stake_currency: string;
  stake_amount: string | number;
  max_open_trades: number;
  bot_name: string;
  state: string;
  exchange: string;
  runmode?: string;
}

export interface Whitelist {
  whitelist: string[];
  length: number;
  method: string[];
}

export interface PairCandleData {
  columns: string[];
  data: Array<Array<number | string>>;
  length: number;
  pair: string;
  timeframe: string;
}
