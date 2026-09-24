"use client";
/** Area chart over time (unix seconds) using TradingView Lightweight Charts. */
import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { PricePoint } from "@/hooks/usePriceStream";

export function TimeChart({ points, color, testId }: { points: PricePoint[]; color: string; testId?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const c = createChart(container.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#7c88a3", fontFamily: "inherit", attributionLogo: false },
      grid: { vertLines: { color: "#1d2538" }, horzLines: { color: "#1d2538" } },
      rightPriceScale: { borderColor: "#263049" },
      timeScale: { borderColor: "#263049", timeVisible: true, secondsVisible: true },
      crosshair: { vertLine: { color: "#3a4666" }, horzLine: { color: "#3a4666" } },
    });
    chart.current = c;
    series.current = c.addSeries(AreaSeries, { lineWidth: 2, priceLineVisible: false });
    return () => c.remove();
  }, []);

  useEffect(() => {
    series.current!.applyOptions({ lineColor: color, topColor: `${color}55`, bottomColor: `${color}05` });
  }, [color]);

  useEffect(() => {
    const ascending = points.filter((p, i) => i === 0 || p.time > points[i - 1].time);
    series.current!.setData(ascending.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    chart.current!.timeScale().fitContent();
  }, [points]);

  return <div ref={container} className="h-full w-full" data-testid={testId} data-points={points.length} />;
}
