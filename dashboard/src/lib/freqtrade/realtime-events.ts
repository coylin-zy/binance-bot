export type RealtimeTone = "info" | "success" | "warning" | "danger";

export interface RealtimeEventSummary {
  label: string;
  detail: string;
  tone: RealtimeTone;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function firstText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function marketDetail(source: Record<string, unknown>) {
  const pair = firstText(source, ["pair", "symbol"]);
  const timeframe = firstText(source, ["timeframe"]);
  return [pair, timeframe].filter(Boolean).join(" / ");
}

export function summarizeRealtimeEvent(type: string, data: unknown): RealtimeEventSummary | null {
  const source = asRecord(data);
  const status = firstText(source, ["status", "message", "reason"]);
  const market = marketDetail(source);

  switch (type) {
    case "entry":
      return { label: "策略触发入场", detail: market || "等待订单成交", tone: "info" };
    case "entry_fill":
      return { label: "入场订单已成交", detail: market || "持仓数据已刷新", tone: "success" };
    case "entry_cancel":
      return { label: "入场订单已取消", detail: market || status || "订单未成交", tone: "warning" };
    case "exit":
      return { label: "策略触发出场", detail: market || status || "等待订单成交", tone: "info" };
    case "exit_fill":
      return { label: "出场订单已成交", detail: market || status || "收益数据已刷新", tone: "success" };
    case "exit_cancel":
      return { label: "出场订单已取消", detail: market || status || "订单未成交", tone: "warning" };
    case "whitelist": {
      const count = Array.isArray(source.whitelist) ? source.whitelist.length : firstText(source, ["length"]);
      return { label: "交易白名单已更新", detail: count ? `${count} 个币对` : "扫描范围已刷新", tone: "info" };
    }
    case "new_candle":
      return { label: "最新 K 线已分析", detail: market || "图表数据已同步", tone: "info" };
    case "status":
      return { label: "机器人状态变化", detail: status || "运行状态已刷新", tone: "info" };
    case "warning":
      return { label: "Freqtrade 风险告警", detail: status || "请检查机器人日志", tone: "warning" };
    case "exception":
      return { label: "Freqtrade 运行异常", detail: status || "请检查机器人日志", tone: "danger" };
    default:
      return null;
  }
}
