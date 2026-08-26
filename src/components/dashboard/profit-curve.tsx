"use client";

import { useEffect, useMemo, useRef } from "react";
import { ColorType, createChart, type AreaData, type IChartApi, type Time } from "lightweight-charts";
import type { TradeHistoryItem } from "@/lib/freqtrade/types";

export function ProfitCurve({ trades }: { trades: TradeHistoryItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const seriesData = useMemo(() => {
    let cumulative = 0;
    const byTime = new Map<number, AreaData>();
    [...trades]
      .filter((trade) => !trade.is_open)
      .sort((a, b) => new Date(a.close_date ?? a.open_date).getTime() - new Date(b.close_date ?? b.open_date).getTime())
      .forEach((trade) => {
        cumulative += trade.profit_abs ?? 0;
        const time = Math.floor(new Date(trade.close_date ?? trade.open_date).getTime() / 1000);
        byTime.set(time, { time: time as Time, value: cumulative });
      });
    return [...byTime.values()];
  }, [trades]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 300,
      layout: { background: { type: ColorType.Solid, color: "#131313" }, textColor: "#84967e", fontFamily: "JetBrains Mono" },
      grid: { vertLines: { color: "rgba(59,75,55,0.42)" }, horzLines: { color: "rgba(59,75,55,0.42)" } },
      rightPriceScale: { borderColor: "rgba(132,150,126,0.2)" },
      timeScale: { borderColor: "rgba(132,150,126,0.2)", timeVisible: true },
      crosshair: { vertLine: { color: "#00ff41", labelBackgroundColor: "#007117" }, horzLine: { color: "#00ff41", labelBackgroundColor: "#007117" } },
      handleScroll: true,
      handleScale: true,
    });
    const series = chart.addAreaSeries({
      lineColor: "#00ff41",
      topColor: "rgba(0,255,65,0.22)",
      bottomColor: "rgba(0,255,65,0.01)",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    series.setData(seriesData);
    chart.timeScale().fitContent();
    chartRef.current = chart;

    const observer = new ResizeObserver(([entry]) => chart.applyOptions({ width: entry.contentRect.width }));
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [seriesData]);

  if (seriesData.length === 0) {
    return <div className="flex h-[300px] items-center justify-center text-xs text-[var(--muted)]">暂无已平仓交易，无法生成收益曲线</div>;
  }

  return <div ref={containerRef} className="h-[300px] w-full" role="img" aria-label="按已平仓交易累计的绝对收益曲线" />;
}
