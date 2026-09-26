"use client";
/** Watched tickers with live prices, plus a form to add new symbols. */
import { useState, type FormEvent } from "react";
import type { StreamState } from "@/hooks/usePriceStream";
import { Panel } from "./Panel";
import { WatchlistRow } from "./WatchlistRow";

interface Props {
  tickers: string[];
  stream: StreamState;
  selected: string | null;
  onSelect: (ticker: string) => void;
  onAdd: (ticker: string) => Promise<void>;
  onRemove: (ticker: string) => Promise<void>;
}

export function Watchlist({ tickers, stream, selected, onSelect, onAdd, onRemove }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ticker = input.trim().toUpperCase();
    if (!ticker) return;
    run(async () => {
      await onAdd(ticker);
      setInput("");
    });
  };

  return (
    <Panel title="Watchlist" className="h-full" aside={<span className="text-muted">{tickers.length}</span>}>
      <div className="flex h-full flex-col">
        <ul className="min-h-0 flex-1 overflow-y-auto py-1" data-testid="watchlist">
          {tickers.map((t) => (
            <WatchlistRow
              key={t}
              ticker={t}
              update={stream.prices[t]}
              history={stream.history[t] ?? []}
              selected={t === selected}
              onSelect={onSelect}
              onRemove={(ticker) => run(() => onRemove(ticker))}
            />
          ))}
        </ul>
        <form onSubmit={submit} className="flex gap-2 border-t border-line p-2">
          <input
            data-testid="watchlist-add-input"
            aria-label="Ticker to watch"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add ticker"
            maxLength={5}
            className="min-w-0 flex-1 rounded-sm border border-line bg-ink px-2 py-1 uppercase placeholder:normal-case placeholder:text-muted"
          />
          <button data-testid="watchlist-add-button" type="submit" className="rounded-sm bg-blue px-3 font-semibold text-ink hover:brightness-110">
            Add
          </button>
        </form>
        {error && (
          <p data-testid="watchlist-error" role="alert" className="px-3 pb-2 text-down">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
