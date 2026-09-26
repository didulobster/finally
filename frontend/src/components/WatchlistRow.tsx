"use client";
/** One watched ticker: symbol, sparkline, flashing price, session change and a remove control. */
import { useFlash } from "@/hooks/useFlash";
import type { PricePoint } from "@/hooks/usePriceStream";
import type { PriceUpdate } from "@/lib/types";
import { percent, price as fmtPrice, trendClass } from "@/lib/format";
import { Sparkline } from "./Sparkline";

interface Props {
  ticker: string;
  update?: PriceUpdate;
  history: PricePoint[];
  selected: boolean;
  onSelect: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}

export function WatchlistRow({ ticker, update, history, selected, onSelect, onRemove }: Props) {
  const price = update?.price;
  const change = update?.session_change_percent ?? 0;
  const flash = useFlash(price);
  return (
    <li
      data-testid={`watchlist-row-${ticker}`}
      data-selected={selected}
      onClick={() => onSelect(ticker)}
      className={`group grid cursor-pointer grid-cols-[3.5rem_1fr_4.5rem_4rem_1.25rem] items-center gap-2 border-l-2 px-3 py-1.5 hover:bg-raised ${
        selected ? "border-accent bg-raised" : "border-transparent"
      }`}
    >
      <span className="font-semibold">{ticker}</span>
      <Sparkline points={history} rising={change >= 0} />
      <span
        data-testid={`watchlist-price-${ticker}`}
        data-flash={flash ?? undefined}
        className={`flash-cell rounded-sm px-1 text-right ${flash ? `flash-${flash}` : ""}`}
      >
        {price === undefined ? "—" : fmtPrice(price)}
      </span>
      <span data-testid={`watchlist-change-${ticker}`} className={`text-right ${trendClass(change)}`}>
        {percent(change)}
      </span>
      <button
        type="button"
        aria-label={`Remove ${ticker}`}
        data-testid={`watchlist-remove-${ticker}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(ticker);
        }}
        className="text-muted opacity-0 hover:text-down focus-visible:opacity-100 group-hover:opacity-100"
      >
        ×
      </button>
    </li>
  );
}
