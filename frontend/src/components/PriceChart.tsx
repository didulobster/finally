"use client";
/** Large live chart of the selected ticker, built from streamed prices since page load. */
import type { StreamState } from "@/hooks/usePriceStream";
import { percent, price as fmtPrice, trendClass } from "@/lib/format";
import { Panel } from "./Panel";
import { TimeChart } from "./TimeChart";

export function PriceChart({ ticker, stream }: { ticker: string | null; stream: StreamState }) {
  const update = ticker ? stream.prices[ticker] : undefined;
  const current = update?.price;
  const change = update?.session_change_percent ?? 0;
  const aside = current !== undefined && (
    <span className="flex gap-3">
      <span data-testid="chart-price" className="font-semibold">{fmtPrice(current)}</span>
      <span className={trendClass(change)}>{percent(change)} since open</span>
    </span>
  );
  return (
    <Panel title={ticker ?? "Select a ticker"} aside={aside} testId="main-chart" data-ticker={ticker ?? undefined}>
      <TimeChart points={ticker ? stream.history[ticker] ?? [] : []} color={change < 0 ? "#ef5350" : "#209dd7"} testId="price-chart" />
    </Panel>
  );
}
