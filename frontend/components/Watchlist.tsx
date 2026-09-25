"use client";

import { formatPercent, formatPrice } from "@/store/format";
import { useTerminal } from "@/store/terminal";

/** Watchlist rows in /api/watchlist order. */
export function Watchlist() {
  const watchlist = useTerminal((s) => s.watchlist);
  return (
    <div>
      {watchlist.map((ticker) => (
        <WatchlistRow key={ticker} ticker={ticker} />
      ))}
    </div>
  );
}

function WatchlistRow({ ticker }: { ticker: string }) {
  const p = useTerminal((s) => s.prices[ticker]);
  const connected = useTerminal((s) => s.status === "connected");
  const fade = `transition-opacity ${connected ? "opacity-100" : "opacity-50"}`;
  const change = p?.session_change_percent ?? 0;
  const color = change > 0 ? "text-up" : change < 0 ? "text-down" : "text-muted";
  return (
    <div
      data-testid={`watchlist-row-${ticker}`}
      className="grid grid-cols-3 border-b border-border px-3 py-1.5 font-mono text-sm tabular-nums hover:bg-panel"
    >
      <span className="font-semibold">{ticker}</span>
      <span data-testid={`watchlist-price-${ticker}`} className={`text-right ${fade}`}>
        {p ? formatPrice(p.price) : "—"}
      </span>
      <span data-testid={`watchlist-change-${ticker}`} className={`text-right ${color} ${fade}`}>
        {p ? formatPercent(p.session_change_percent) : ""}
      </span>
    </div>
  );
}
