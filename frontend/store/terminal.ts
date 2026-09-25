import { create } from "zustand";

/** Price stream connection state shown by the header status dot. */
export type Status = "connected" | "reconnecting" | "disconnected";

/** One ticker's live price, mirroring backend PriceUpdate.to_dict(). */
export type Price = {
  ticker: string;
  price: number;
  previous_price: number;
  timestamp: number;
  change: number;
  change_percent: number;
  direction: "up" | "down" | "flat";
  open_price: number;
  session_change_percent: number;
};

/** The whole client state: connection, live prices, watchlist order, and cash. */
export type TerminalState = {
  status: Status;
  prices: Record<string, Price>;
  watchlist: string[];
  cash: number | null;
  totalValue: number | null;
};

type WatchlistItem = Price | { ticker: string; price: null };

/** The single app store; components read it through narrow selectors. */
export const useTerminal = create<TerminalState>()(() => ({
  status: "reconnecting",
  prices: {},
  watchlist: [],
  cash: null,
  totalValue: null,
}));

/** Seed from REST, then keep prices and status live from one EventSource. Returns cleanup. */
export function connect(): () => void {
  fetch("/api/watchlist")
    .then((r) => r.json())
    .then((items: WatchlistItem[]) => {
      const seeded = items.filter((i): i is Price => i.price !== null);
      useTerminal.setState((s) => ({
        watchlist: items.map((i) => i.ticker),
        prices: { ...Object.fromEntries(seeded.map((i) => [i.ticker, i])), ...s.prices },
      }));
    });
  fetch("/api/portfolio")
    .then((r) => r.json())
    .then((p) => useTerminal.setState({ cash: p.cash_balance, totalValue: p.total_value }));

  const es = new EventSource("/api/stream/prices");
  es.onopen = () => useTerminal.setState({ status: "connected" });
  es.onerror = () =>
    useTerminal.setState({ status: es.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting" });
  es.onmessage = (e) => useTerminal.setState((s) => ({ prices: { ...s.prices, ...JSON.parse(e.data) } }));
  return () => es.close();
}
