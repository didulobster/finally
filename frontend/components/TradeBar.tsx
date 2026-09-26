"use client";

import { useState } from "react";
import { placeTrade, type TradeResult } from "@/store/terminal";

const INPUT =
  "h-8 w-24 border border-border bg-bg px-2 font-mono text-sm uppercase focus:border-primary focus:outline-none placeholder:text-muted";
const BUTTON =
  "h-8 w-16 text-sm font-semibold text-bg hover:brightness-110 active:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";

/** Market order entry: typed ticker and quantity, Buy and Sell, and the last trade's result. */
export function TradeBar() {
  const [ticker, setTicker] = useState("");
  const [qty, setQty] = useState("");
  const [result, setResult] = useState<TradeResult | null>(null);

  const trade = async (side: "buy" | "sell") => setResult(await placeTrade(ticker, Number(qty), side));

  const color = result === null ? "text-muted" : result.ok ? "text-up" : "text-down";
  const text = result?.text ?? "Market order · fills instantly at the live price";
  return (
    <div className="flex h-full flex-wrap items-center gap-2 px-3">
      <input
        data-testid="trade-ticker"
        type="text"
        aria-label="Ticker"
        placeholder="Ticker"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        className={INPUT}
      />
      <input
        data-testid="trade-quantity"
        type="number"
        step="any"
        min="0"
        aria-label="Quantity"
        placeholder="Qty"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className={INPUT}
      />
      <button data-testid="trade-buy" type="button" aria-label="Buy shares" onClick={() => trade("buy")} className={`${BUTTON} bg-up`}>
        Buy
      </button>
      <button data-testid="trade-sell" type="button" aria-label="Sell shares" onClick={() => trade("sell")} className={`${BUTTON} bg-down`}>
        Sell
      </button>
      <p
        data-testid="trade-result"
        role="status"
        aria-live="polite"
        title={text}
        className={`ml-2 min-w-0 flex-1 truncate font-mono text-xs ${color}`}
      >
        {text}
      </p>
    </div>
  );
}
