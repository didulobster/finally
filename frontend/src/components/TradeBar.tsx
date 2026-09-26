"use client";
/** Market order entry: ticker, quantity, buy or sell. */
import { useState, type FormEvent } from "react";
import type { Side } from "@/lib/types";

interface Props {
  ticker: string;
  onTickerChange: (ticker: string) => void;
  onTrade: (ticker: string, quantity: number, side: Side) => Promise<string>;
}

export function TradeBar({ ticker, onTickerChange, onTrade }: Props) {
  const [qty, setQty] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const trade = async (side: Side) => {
    const quantity = Number(qty);
    if (!ticker.trim() || !(quantity > 0)) {
      setResult({ ok: false, text: "Enter a ticker and a quantity above zero." });
      return;
    }
    setBusy(true);
    try {
      setResult({ ok: true, text: await onTrade(ticker.trim().toUpperCase(), quantity, side) });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => e.preventDefault();

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2">
      <span className="font-semibold text-muted">Trade</span>
      <input
        data-testid="trade-ticker"
        aria-label="Ticker"
        value={ticker}
        onChange={(e) => onTickerChange(e.target.value.toUpperCase())}
        placeholder="Ticker"
        maxLength={5}
        className="w-20 rounded-sm border border-line bg-ink px-2 py-1 uppercase placeholder:normal-case placeholder:text-muted"
      />
      <input
        data-testid="trade-quantity"
        aria-label="Quantity"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="Qty"
        type="number"
        min="0"
        step="any"
        className="w-24 rounded-sm border border-line bg-ink px-2 py-1 placeholder:text-muted"
      />
      <button
        data-testid="trade-buy"
        type="button"
        disabled={busy}
        onClick={() => trade("buy")}
        className="rounded-sm bg-up px-4 py-1 font-semibold text-ink hover:brightness-110 disabled:opacity-50"
      >
        Buy
      </button>
      <button
        data-testid="trade-sell"
        type="button"
        disabled={busy}
        onClick={() => trade("sell")}
        className="rounded-sm bg-down px-4 py-1 font-semibold text-ink hover:brightness-110 disabled:opacity-50"
      >
        Sell
      </button>
      {result && (
        <span data-testid="trade-result" role="status" className={`ml-2 ${result.ok ? "text-up" : "text-down"}`}>
          {result.text}
        </span>
      )}
    </form>
  );
}
