"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bot, CandlestickChart, LockKeyhole, Radio } from "lucide-react";
import useSWR from "swr";
import {
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import { PageHeader } from "@/components/dashboard/page-header";
import { useRealtime } from "@/hooks/use-realtime";
import { apiFetcher, postApi } from "@/lib/api";
import { tradeRows } from "@/lib/freqtrade/normalizers";
import type { PairCandleData, ShowConfig, TradeHistoryResponse, Whitelist } from "@/lib/freqtrade/types";
import { formatUsd } from "@/lib/utils";

interface CandleRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export default function ChartPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ReturnType<IChartApi["addCandlestickSeries"]> | null>(null);
  const [pair, setPair] = useState("BTC/USDT");
  const [latest, setLatest] = useState<CandleRow | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const { lastCandleAt } = useRealtime();

  const whitelist = useSWR<Whitelist>("/api/ft/whitelist", apiFetcher);
  const trades = useSWR<TradeHistoryResponse>("/api/ft/trades?limit=500", apiFetcher, { refreshInterval: 30_000 });
  const config = useSWR<ShowConfig>("/api/ft/show_config", apiFetcher, { refreshInterval: 30_000 });
  const pairs = whitelist.data?.whitelist?.length ? whitelist.data.whitelist : ["BTC/USDT"];
  const timeframe = config.data?.timeframe ?? "5m";

  useEffect(() => {
    if (whitelist.data?.whitelist?.length && !whitelist.data.whitelist.includes(pair)) {
      setPair(whitelist.data.whitelist[0]);
    }
  }, [pair, whitelist.data]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: { background: { type: ColorType.Solid, color: "#131313" }, textColor: "#84967e", fontFamily: "JetBrains Mono" },
      grid: { vertLines: { color: "rgba(59,75,55,0.45)" }, horzLines: { color: "rgba(59,75,55,0.45)" } },
      crosshair: { vertLine: { color: "#00ff41", labelBackgroundColor: "#007117" }, horzLine: { color: "#00ff41", labelBackgroundColor: "#007117" } },
      rightPriceScale: { borderColor: "rgba(132,150,126,0.22)", scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: "rgba(132,150,126,0.22)", timeVisible: true, secondsVisible: false },
    });
    candleSeriesRef.current = chart.addCandlestickSeries({
      upColor: "#131313",
      downColor: "#ffb4ab",
      borderUpColor: "#00ff41",
      borderDownColor: "#ffb4ab",
      wickUpColor: "#00ff41",
      wickDownColor: "#ffb4ab",
    });
    chartRef.current = chart;
    const observer = new ResizeObserver(([entry]) => chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCandles() {
      if (!candleSeriesRef.current || !pair) return;
      setChartLoading(true);
      setChartError(null);
      try {
        const payload = await postApi<PairCandleData>("/api/ft/pair_candles", { pair, timeframe, limit: 500 });
        const columns = payload.columns ?? [];
        const index = (name: string) => columns.indexOf(name);
        const parsed = (payload.data ?? []).map((row) => ({
          time: Math.floor(new Date(String(row[index("date")])).getTime() / 1000),
          open: Number(row[index("open")]),
          high: Number(row[index("high")]),
          low: Number(row[index("low")]),
          close: Number(row[index("close")]),
          volume: index("volume") >= 0 ? Number(row[index("volume")]) : undefined,
        })).filter((row) => Number.isFinite(row.time) && Number.isFinite(row.close));
        if (!cancelled) {
          candleSeriesRef.current?.setData(parsed as unknown as CandlestickData[]);
          chartRef.current?.timeScale().fitContent();
          setLatest(parsed.at(-1) ?? null);
        }
      } catch (error) {
        if (!cancelled) setChartError(error instanceof Error ? error.message : "K 线数据读取失败");
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    }
    loadCandles();
    return () => { cancelled = true; };
  }, [lastCandleAt, pair, timeframe]);

  const pairTrades = useMemo(() => tradeRows(trades.data).filter((trade) => trade.pair === pair), [pair, trades.data]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const markers = pairTrades.flatMap((trade) => {
      const openMarker = {
        time: Math.floor(new Date(trade.open_date).getTime() / 1000) as Time,
        position: trade.is_short ? "aboveBar" : "belowBar",
        color: trade.is_short ? "#ffb4ab" : "#00ff41",
        shape: trade.is_short ? "arrowDown" : "arrowUp",
        text: trade.is_short ? "SHORT" : "LONG",
      };
      const closeMarker = trade.close_date ? [{
        time: Math.floor(new Date(trade.close_date).getTime() / 1000) as Time,
        position: trade.is_short ? "belowBar" : "aboveBar",
        color: "#e5e2e1",
        shape: "circle",
        text: "EXIT",
      }] : [];
      return [openMarker, ...closeMarker];
    }).sort((a, b) => Number(a.time) - Number(b.time));
    candleSeriesRef.current.setMarkers(markers as never);
  }, [pairTrades]);

  const state = config.data?.state?.toUpperCase() ?? "UNKNOWN";

  return (
    <div className="mx-auto max-w-[1540px]">
      <PageHeader
        eyebrow="[ MARKET.REALTIME_CHART ]"
        title="市场遥测与策略标记"
        description="实时读取白名单币对的 Freqtrade 蜡烛数据，并叠加机器人历史入场与出场标记。此页面没有手动下单入口。"
        actions={<div className="flex items-center gap-2 border border-[var(--line-soft)] bg-[var(--surface-low)] px-3 py-2 text-[0.66rem] text-[var(--terminal)]"><Radio size={14} />MARKET_DATA</div>}
      />

      <div className="mb-5 flex flex-col gap-4 border border-[var(--line-soft)] bg-[var(--surface-low)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex min-w-56 flex-col gap-1.5"><span className="terminal-label text-[0.56rem]">Trading pair</span><select value={pair} onChange={(event) => setPair(event.target.value)} className="min-h-11 rounded-[2px] border border-[var(--line)] bg-[var(--surface-dim)] px-3 text-xs text-[var(--text)]">{pairs.map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="flex min-w-36 flex-col gap-1.5"><span className="terminal-label text-[0.56rem]">Strategy timeframe</span><output aria-label="Strategy timeframe" className="flex min-h-11 items-center justify-between rounded-[2px] border border-[var(--line)] bg-[var(--surface-dim)] px-3 text-xs font-bold text-[var(--text)]"><span>{timeframe}</span><span className="flex items-center gap-1.5 text-[0.55rem] font-normal text-[var(--muted)]"><span className="status-dot text-[var(--terminal)]" />CONFIG</span></output></div>
        </div>
        <div className="flex items-end gap-8">
          <div><div className="terminal-label text-[0.56rem]">Last price</div><div className="terminal-value mt-1 text-xl font-bold text-[var(--terminal)]">{formatUsd(latest?.close)}</div></div>
          <div className="hidden sm:block"><div className="terminal-label text-[0.56rem]">Candles</div><div className="terminal-value mt-1 text-sm font-bold">500 MAX</div></div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="terminal-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4">
            <div><div className="terminal-label text-[var(--terminal)]">{pair} / {timeframe}</div><h2 className="mt-1 font-display text-sm font-bold">Candlestick stream</h2></div>
            <div className="flex items-center gap-2 text-[0.62rem] text-[var(--muted)]"><Activity size={14} />{chartLoading ? "SYNCING" : chartError ? "ERROR" : latest ? "READY" : "NO DATA"}</div>
          </div>
          {chartError && <div className="border-b border-[rgba(255,180,171,0.22)] bg-[rgba(147,0,10,0.14)] px-5 py-3 text-xs text-[var(--danger)]" role="alert">{chartError}</div>}
          <div className="relative">
            <div ref={containerRef} className="h-[440px] w-full lg:h-[560px]" role="img" aria-label={`${pair} ${timeframe} K 线图`} />
            {!chartLoading && !chartError && !latest && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-[rgba(14,14,14,0.72)] px-6 text-center">
                <CandlestickChart size={30} strokeWidth={1.2} className="mb-4 text-[var(--muted)]" />
                <div className="font-display text-sm font-bold">NO_CANDLE_DATA</div>
                <p className="mt-2 max-w-md text-xs leading-5 text-[var(--muted)]">Freqtrade 当前没有为该策略周期提供已分析 K 线，等待下一轮数据刷新。</p>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="terminal-panel overflow-hidden">
            <div className="border-b border-[var(--line-soft)] px-5 py-4"><div className="terminal-label text-[var(--terminal)]">Latest candle</div><h2 className="mt-1 font-display text-sm font-bold">OHLC 快照</h2></div>
            <dl className="grid grid-cols-2 gap-px bg-[var(--line-soft)]">
              {[["OPEN", latest?.open], ["HIGH", latest?.high], ["LOW", latest?.low], ["CLOSE", latest?.close]].map(([label, value]) => <div key={String(label)} className="bg-[var(--surface-low)] p-4"><dt className="terminal-label text-[0.55rem]">{label}</dt><dd className="terminal-value mt-2 text-xs font-bold">{formatUsd(value as number | undefined)}</dd></div>)}
            </dl>
          </section>

          <section className="terminal-panel p-5">
            <div className="flex items-center gap-2 text-[var(--terminal)]"><Bot size={17} /><span className="terminal-label text-[var(--terminal)]">Strategy overlay</span></div>
            <dl className="mt-5 space-y-4 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">机器人状态</dt><dd className="font-bold">{state}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">策略</dt><dd className="max-w-40 truncate font-bold">{config.data?.strategy ?? "--"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">交易标记</dt><dd className="font-bold">{pairTrades.length}</dd></div>
            </dl>
          </section>

          <section className="border border-[rgba(0,255,65,0.28)] bg-[rgba(0,255,65,0.035)] p-5">
            <div className="flex items-center gap-2 text-[var(--terminal)]"><LockKeyhole size={16} /><span className="terminal-label text-[var(--terminal)]">Read-only terminal</span></div>
            <p className="mt-3 text-[0.67rem] leading-5 text-[var(--text-soft)]">图表只展示行情与策略交易标记。手动买入、卖出、强平接口均未暴露。</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
