import { create } from "zustand";
import { formatPrice, formatQty } from "./format";

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

/** A held position as returned by /api/portfolio. */
export type Position = { ticker: string; quantity: number; avg_cost: number; current_price: number };

type Portfolio = { cash_balance: number; positions: Position[]; total_value: number };

/** Outcome of a trade, shown by the trade bar. */
export type TradeResult = { ok: boolean; text: string };

/** The whole client state: connection, live prices, watchlist order, cash, and positions. */
export type TerminalState = {
  status: Status;
  prices: Record<string, Price>;
  watchlist: string[];
  cash: number | null;
  positions: Position[];
  totalValue: number | null;
};

type WatchlistItem = Price | { ticker: string; price: null };

/** The single app store; components read it through narrow selectors. */
export const useTerminal = create<TerminalState>()(() => ({
  status: "reconnecting",
  prices: {},
  watchlist: [],
  cash: null,
  positions: [],
  totalValue: null,
}));

/** Write a server portfolio (GET /api/portfolio or a trade response) into the store. */
export function applyPortfolio(p: Portfolio): void {
  useTerminal.setState({ cash: p.cash_balance, positions: p.positions, totalValue: p.total_value });
}

/** Place a market order; the store changes only when the server fills it. */
export async function placeTrade(ticker: string, quantity: number, side: "buy" | "sell"): Promise<TradeResult> {
  let r: Response;
  try {
    r = await fetch("/api/portfolio/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, quantity, side }),
    });
  } catch {
    return { ok: false, text: "Trade not sent: connection to the server failed. Try again." };
  }
  const body = await r.json();
  if (!r.ok) return { ok: false, text: typeof body.detail === "string" ? body.detail : body.detail[0].msg };
  applyPortfolio(body.portfolio);
  const t = body.trade;
  const verb = t.side === "buy" ? "Bought" : "Sold";
  return { ok: true, text: `${verb} ${formatQty(t.quantity)} ${t.ticker} @ ${formatPrice(t.price)}` };
}

// A non-200 or non-event-stream response closes an EventSource for good; the browser stops retrying.
const REOPEN_DELAY_MS = 3000;

/**
 * Seed from REST, then keep prices and status live from one EventSource.
 * The single stream is reopened after a closing error. Returns cleanup.
 */
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
    .then(applyPortfolio);

  let es: EventSource;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    const current = new EventSource("/api/stream/prices");
    es = current;
    current.onopen = () => useTerminal.setState({ status: "connected" });
    current.onerror = () => {
      if (current.readyState === EventSource.CLOSED) {
        useTerminal.setState({ status: "disconnected" });
        timer = setTimeout(open, REOPEN_DELAY_MS);
      } else {
        useTerminal.setState({ status: "reconnecting" });
      }
    };
    current.onmessage = (e) => useTerminal.setState((s) => ({ prices: { ...s.prices, ...JSON.parse(e.data) } }));
  };
  open();
  return () => {
    clearTimeout(timer);
    es.close();
  };
}
