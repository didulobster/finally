"use client";
/** Subscribes to /api/stream/prices and accumulates latest prices and per-ticker price history. */
import { useEffect, useState } from "react";
import type { ConnectionStatus, PriceMap } from "@/lib/types";

export const HISTORY_LIMIT = 600;

export interface PricePoint {
  time: number;
  value: number;
}

export interface StreamState {
  prices: PriceMap;
  history: Record<string, PricePoint[]>;
}

export const emptyStream: StreamState = { prices: {}, history: {} };

/** Merge one SSE payload into the accumulated stream state. */
export function applyPrices(state: StreamState, payload: PriceMap): StreamState {
  const history = { ...state.history };
  for (const [ticker, update] of Object.entries(payload)) {
    const points = history[ticker] ?? [];
    const last = points.at(-1);
    if (last?.time === update.timestamp) continue;
    history[ticker] = [...points, { time: update.timestamp, value: update.price }].slice(-HISTORY_LIMIT);
  }
  return { prices: payload, history };
}

export function usePriceStream() {
  const [stream, setStream] = useState<StreamState>(emptyStream);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const source = new EventSource("/api/stream/prices");
    source.onopen = () => setStatus("connected");
    source.onerror = () =>
      setStatus(source.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting");
    source.onmessage = (event) => {
      setStatus("connected");
      setStream((s) => applyPrices(s, JSON.parse(event.data)));
    };
    return () => source.close();
  }, []);

  return { ...stream, status };
}
