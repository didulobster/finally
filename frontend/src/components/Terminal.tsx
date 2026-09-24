"use client";
/** Top-level trading workstation: owns server state and wires panels together. */
import { useCallback, useEffect, useState } from "react";
import { usePriceStream } from "@/hooks/usePriceStream";
import { api } from "@/lib/api";
import { quantity as fmtQty, price as fmtPrice } from "@/lib/format";
import { revaluePortfolio } from "@/lib/portfolio";
import type { Portfolio, Side, Snapshot } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { Header } from "./Header";
import { Heatmap } from "./Heatmap";
import { PnlChart } from "./PnlChart";
import { PositionsTable } from "./PositionsTable";
import { PriceChart } from "./PriceChart";
import { TradeBar } from "./TradeBar";
import { Watchlist } from "./Watchlist";

const REFRESH_MS = 15_000;

export function Terminal() {
  const { status, ...stream } = usePriceStream();
  const [tickers, setTickers] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tradeTicker, setTradeTicker] = useState("");

  const refreshWatchlist = useCallback(async () => {
    const items = await api.watchlist();
    setTickers(items.map((i) => i.ticker));
    setSelected((s) => s ?? items[0]?.ticker ?? null);
  }, []);

  const refreshPortfolio = useCallback(async () => {
    const [p, h] = await Promise.all([api.portfolio(), api.history()]);
    setPortfolio(p);
    setHistory(h);
  }, []);

  useEffect(() => {
    // State is set after the fetches resolve, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshWatchlist();
    refreshPortfolio();
    const timer = setInterval(refreshPortfolio, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshWatchlist, refreshPortfolio]);

  const select = (ticker: string) => {
    setSelected(ticker);
    setTradeTicker(ticker);
  };

  const addTicker = async (ticker: string) => {
    await api.addTicker(ticker);
    await refreshWatchlist();
  };

  const removeTicker = async (ticker: string) => {
    await api.removeTicker(ticker);
    await refreshWatchlist();
  };

  const trade = async (ticker: string, quantity: number, side: Side) => {
    const { trade: t, portfolio: p } = await api.trade(ticker, quantity, side);
    setPortfolio(p);
    setHistory(await api.history());
    return `${t.side === "buy" ? "Bought" : "Sold"} ${fmtQty(t.quantity)} ${t.ticker} at ${fmtPrice(t.price)}`;
  };

  const chat = async (message: string) => {
    const response = await api.chat(message);
    await Promise.all([refreshWatchlist(), refreshPortfolio()]);
    return response;
  };

  const live = portfolio && revaluePortfolio(portfolio, stream.prices);

  return (
    <div className="flex min-h-screen flex-col max-lg:pb-16 lg:h-screen">
      <Header portfolio={live} status={status} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="h-[22rem] shrink-0 border-line max-lg:border-b lg:h-auto lg:w-80 lg:border-r">
          <Watchlist
            tickers={tickers}
            stream={stream}
            selected={selected}
            onSelect={select}
            onAdd={addTicker}
            onRemove={removeTicker}
          />
        </div>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-rows-[20rem_15rem_minmax(11rem,auto)] gap-px bg-line lg:grid-rows-[minmax(0,1fr)_minmax(0,15rem)_minmax(0,11rem)]">
            <PriceChart ticker={selected} stream={stream} />
            <div className="grid min-h-0 grid-cols-2 gap-px">
              <Heatmap positions={live?.positions ?? []} onSelect={select} />
              <PnlChart snapshots={history} />
            </div>
            <PositionsTable positions={live?.positions ?? []} onSelect={select} />
          </div>
          <TradeBar ticker={tradeTicker} onTickerChange={setTradeTicker} onTrade={trade} />
        </main>
        <ChatPanel onSend={chat} loadHistory={api.chatHistory} />
      </div>
    </div>
  );
}
