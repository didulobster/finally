"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { formatPrice } from "@/store/format";
import { loadHistory, useTerminal, type Snapshot } from "@/store/terminal";

// Matches the backend SNAPSHOT_INTERVAL (30 s), so each poll can bring one new snapshot.
const HISTORY_POLL_MS = 30_000;

/** One point per whole second, last wins: Lightweight Charts needs strictly ascending unique times. */
function toPoints(history: Snapshot[]) {
  const bySecond = new Map<number, number>();
  for (const s of history) bySecond.set(Math.floor(Date.parse(s.recorded_at) / 1000), s.total_value);
  return [...bySecond].map(([time, value]) => ({ time: time as UTCTimestamp, value }));
}

/** Canvas area chart of stored portfolio value snapshots, green when up since the first, red when down. */
export function PnlChart() {
  const history = useTerminal((s) => s.history);
  const points = useMemo(() => toPoints(history), [history]);
  const mount = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    loadHistory();
    const id = setInterval(loadHistory, HISTORY_POLL_MS);
    const c = createChart(mount.current!, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b949e", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: "#30363d" } },
      rightPriceScale: { borderColor: "#30363d" },
      timeScale: { borderColor: "#30363d", timeVisible: true },
      localization: { priceFormatter: formatPrice },
    });
    chart.current = c;
    series.current = c.addSeries(AreaSeries, { lineWidth: 2 });
    return () => {
      clearInterval(id);
      c.remove();
    };
  }, []);

  useEffect(() => {
    if (points.length === 0) return;
    const rgb = points[points.length - 1].value >= points[0].value ? "63, 185, 80" : "248, 81, 73";
    series.current!.applyOptions({
      lineColor: `rgb(${rgb})`,
      topColor: `rgba(${rgb}, 0.4)`,
      bottomColor: `rgba(${rgb}, 0)`,
    });
    series.current!.setData(points);
    chart.current!.timeScale().fitContent();
  }, [points]);

  return (
    <div data-testid="pnl-chart" data-points={points.length} className="relative h-full min-h-40">
      <div ref={mount} className="absolute inset-0" />
      {points.length === 0 && (
        <p className="absolute inset-0 p-3 text-xs text-muted">Waiting for the first portfolio snapshot…</p>
      )}
    </div>
  );
}
