import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.env.MOCK_FREQTRADE_PORT ?? 18080);
let botState = "running";

const trades = [
  { trade_id: 1048, pair: "BTC/USDT", is_open: false, is_short: false, open_rate: 62312.2, close_rate: 63591.4, current_rate: 63591.4, amount: 0.003, stake_amount: 187, close_profit: 0.0205, profit_ratio: 0.0205, profit_pct: 2.05, profit_abs: 3.84, open_date: "2026-08-24T08:15:00Z", close_date: "2026-08-24T14:40:00Z", exit_reason: "roi", enter_tag: "trend", stop_loss_abs: 60000, stop_loss_ratio: -0.04 },
  { trade_id: 1047, pair: "ETH/USDT", is_open: false, is_short: false, open_rate: 2768.4, close_rate: 2742.1, current_rate: 2742.1, amount: 0.07, stake_amount: 194, close_profit: -0.0095, profit_ratio: -0.0095, profit_pct: -0.95, profit_abs: -1.84, open_date: "2026-08-22T03:20:00Z", close_date: "2026-08-22T09:12:00Z", exit_reason: "stop_loss", enter_tag: "breakout", stop_loss_abs: 2742.1, stop_loss_ratio: -0.01 },
  { trade_id: 1046, pair: "SOL/USDT", is_open: false, is_short: false, open_rate: 142.1, close_rate: 148.8, current_rate: 148.8, amount: 1.3, stake_amount: 185, close_profit: 0.0471, profit_ratio: 0.0471, profit_pct: 4.71, profit_abs: 8.72, open_date: "2026-08-19T10:05:00Z", close_date: "2026-08-20T02:08:00Z", exit_reason: "trailing_stop_loss", enter_tag: "momentum", stop_loss_abs: 137, stop_loss_ratio: -0.04 },
  { trade_id: 1045, pair: "BTC/USDT", is_open: false, is_short: false, open_rate: 61410.2, close_rate: 61932.5, current_rate: 61932.5, amount: 0.003, stake_amount: 184, close_profit: 0.0085, profit_ratio: 0.0085, profit_pct: 0.85, profit_abs: 1.57, open_date: "2026-08-12T05:30:00Z", close_date: "2026-08-12T12:18:00Z", exit_reason: "roi", enter_tag: "trend", stop_loss_abs: 59000, stop_loss_ratio: -0.04 },
  { trade_id: 1050, pair: "BTC/USDT", is_open: true, is_short: false, open_rate: 63920.4, close_rate: null, current_rate: 64490.1, amount: 0.003, stake_amount: 191.76, close_profit: null, profit_ratio: 0.0089, profit_pct: 0.89, profit_abs: 1.71, open_date: "2026-08-26T02:14:00Z", close_date: null, exit_reason: null, enter_tag: "trend", stop_loss_abs: 61363.5, stop_loss_ratio: -0.04 },
  { trade_id: 1049, pair: "SOL/USDT", is_open: true, is_short: false, open_rate: 147.82, close_rate: null, current_rate: 146.96, amount: 1.28, stake_amount: 189.21, close_profit: null, profit_ratio: -0.0058, profit_pct: -0.58, profit_abs: -1.1, open_date: "2026-08-25T18:44:00Z", close_date: null, exit_reason: null, enter_tag: "breakout", stop_loss_abs: 141.9, stop_loss_ratio: -0.04 },
];

function json(response, status = 200) {
  return { status, headers: { "content-type": "application/json" }, body: JSON.stringify(response) };
}

function period(date, profit, count) {
  return { date, abs_profit: profit, rel_profit: profit / 1000, starting_balance: 1000, rel_profit_close: profit / 1000, abs_profit_close: profit, trade_count: count };
}

function candles() {
  const data = [];
  let value = 63200;
  const start = Date.now() - 120 * 300_000;
  for (let index = 0; index < 120; index += 1) {
    const open = value;
    const movement = Math.sin(index / 5) * 90 + Math.cos(index / 13) * 45 + 12;
    const close = open + movement;
    const high = Math.max(open, close) + 45 + (index % 5) * 8;
    const low = Math.min(open, close) - 38 - (index % 3) * 7;
    data.push([new Date(start + index * 300_000).toISOString(), open, high, low, close, 22 + (index % 12)]);
    value = close;
  }
  return { columns: ["date", "open", "high", "low", "close", "volume"], data, length: data.length, pair: "BTC/USDT", timeframe: "5m" };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const path = url.pathname.replace("/api/v1/", "");
  let result;

  if (path === "token/login" || path === "token/refresh") result = json({ access_token: "qa-access", refresh_token: "qa-refresh" });
  else if (path === "balance") result = json({ currencies: [], total: 1024.93, total_bot: 1024.93, symbol: "$", value: 1024.93, stake: "USDT", note: "" });
  else if (path === "profit") result = json({ profit_closed_coin: 24.93, profit_all_coin: 25.54, trade_count_closed_profit: 31, trade_count_closed_loss: 11, winrate: 0.7381, trade_count: 44, closed_trade_count: 42, avg_duration: "6:42:00", max_drawdown: 0.0418, best_pair: "SOL/USDT" });
  else if (path === "daily") result = json({ data: [period("2026-08-26", 4.62, 3), period("2026-08-25", -1.1, 2)] });
  else if (path === "weekly") result = json({ data: [period("2026-08-24", 11.44, 8), period("2026-08-17", 6.88, 9)] });
  else if (path === "monthly") result = json({ data: [period("2026-08-01", 24.93, 42)] });
  else if (path === "status") result = json(trades.filter((trade) => trade.is_open));
  else if (path === "trades") result = json({ trades, trades_count: trades.length, total_trades: trades.length, offset: 0 });
  else if (path === "show_config") result = json({ dry_run: true, trading_mode: "spot", strategy: "SimpleSpot", strategy_version: "1.4.2", timeframe: "5m", stake_currency: "USDT", stake_amount: 200, max_open_trades: 3, bot_name: "coylin_bot", state: botState, exchange: "binance", runmode: "dry_run" });
  else if (path === "whitelist") result = json({ whitelist: ["BTC/USDT", "ETH/USDT", "SOL/USDT"], length: 3, method: ["StaticPairList"] });
  else if (path === "pair_candles") result = json(candles());
  else if (["pause", "stop", "start"].includes(path)) {
    botState = path === "pause" ? "paused" : path === "stop" ? "stopped" : "running";
    result = json({ status: botState });
  } else result = json({ error: "Not found" }, 404);

  response.writeHead(result.status, result.headers);
  response.end(result.body);
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  if (request.url?.startsWith("/api/v1/message/ws")) {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  } else socket.destroy();
});
wss.on("connection", (ws) => ws.send(JSON.stringify({ type: "status", data: { state: botState } })));

server.listen(port, "127.0.0.1", () => console.log(`Mock Freqtrade listening on http://127.0.0.1:${port}`));
