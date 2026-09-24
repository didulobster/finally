"use client";
/** Collapsible AI assistant sidebar; shows executed trades and watchlist changes inline. */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNarrow } from "@/hooks/useNarrow";
import { price, quantity } from "@/lib/format";
import type { ChatHistoryItem, ChatResponse, Trade, WatchlistChange } from "@/lib/types";

/** Ids for messages created in this tab; crypto.randomUUID needs a secure context, which plain-HTTP hosts lack. */
let seq = 0;
const nextId = () => `local-${++seq}`;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  trades?: Trade[];
  watchlist_changes?: WatchlistChange[];
}

function Actions({ trades = [], changes = [] }: { trades?: Trade[]; changes?: WatchlistChange[] }) {
  if (!trades.length && !changes.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {trades.map((t) => (
        <li key={t.id} data-testid="chat-action" data-kind="trade" className="rounded-sm border border-line bg-ink px-2 py-1">
          <span className={t.side === "buy" ? "text-up" : "text-down"}>{t.side === "buy" ? "Bought" : "Sold"}</span>{" "}
          {quantity(t.quantity)} {t.ticker} at {price(t.price)}
        </li>
      ))}
      {changes.map((c) => (
        <li key={`${c.action}-${c.ticker}`} data-testid="chat-action" data-kind="watchlist" className="rounded-sm border border-line bg-ink px-2 py-1">
          <span className="text-blue">{c.action === "add" ? "Watching" : "Stopped watching"}</span> {c.ticker}
        </li>
      ))}
    </ul>
  );
}

function fromHistory(item: ChatHistoryItem): ChatMessage {
  return {
    id: item.id,
    role: item.role,
    content: item.content,
    trades: item.actions?.trades,
    watchlist_changes: item.actions?.watchlist_changes,
  };
}

interface Props {
  onSend: (message: string) => Promise<ChatResponse>;
  loadHistory: () => Promise<ChatHistoryItem[]>;
}

export function ChatPanel({ onSend, loadHistory }: Props) {
  const narrow = useNarrow();
  const [openOverride, setOpen] = useState<boolean | null>(null);
  const open = openOverride ?? !narrow;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadHistory()
      .then((items) => setMessages((m) => (m.length ? m : items.map(fromHistory))))
      .catch(() => {});
  }, [loadHistory]);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [messages, loading]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { id: nextId(), role: "user", content: text }]);
    setLoading(true);
    try {
      const r = await onSend(text);
      setMessages((m) => [...m, { id: nextId(), role: "assistant", content: r.message, trades: r.trades, watchlist_changes: r.watchlist_changes }]);
    } catch (err) {
      setMessages((m) => [...m, { id: nextId(), role: "assistant", content: `Could not reach the assistant: ${(err as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        data-testid="chat-toggle"
        onClick={() => setOpen(true)}
        className="w-9 shrink-0 border-l border-line bg-panel py-3 font-semibold text-accent [writing-mode:vertical-rl] hover:bg-raised max-lg:fixed max-lg:right-4 max-lg:bottom-4 max-lg:z-20 max-lg:w-auto max-lg:rounded-sm max-lg:border max-lg:px-4 max-lg:py-2 max-lg:[writing-mode:horizontal-tb]"
      >
        Ask FinAlly
      </button>
    );
  }

  return (
    <aside data-testid="chat-panel" className="flex w-[22rem] shrink-0 flex-col border-l border-line bg-panel max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-20 max-lg:max-w-full max-lg:shadow-2xl">
      <header className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="font-semibold text-accent">FinAlly assistant</h2>
        <button type="button" data-testid="chat-toggle" aria-label="Collapse chat" onClick={() => setOpen(false)} className="text-muted hover:text-text">
          ⟩
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-testid="chat-messages">
        {messages.length === 0 && (
          <p className="text-muted">Ask about your portfolio, or tell me to trade: “Buy 5 NVDA” or “Add PYPL to my watchlist”.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            data-testid="chat-message"
            data-role={m.role}
            className={m.role === "user" ? "ml-8 rounded-sm bg-raised px-3 py-2" : "mr-4 border-l-2 border-accent pl-3"}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
            <Actions trades={m.trades} changes={m.watchlist_changes} />
          </div>
        ))}
        {loading && (
          <p data-testid="chat-loading" className="animate-pulse text-muted">
            Thinking…
          </p>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-line p-2">
        <input
          data-testid="chat-input"
          aria-label="Message the assistant"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message FinAlly"
          className="min-w-0 flex-1 rounded-sm border border-line bg-ink px-2 py-1.5 placeholder:text-muted"
        />
        <button
          data-testid="chat-send"
          type="submit"
          disabled={loading}
          className="rounded-sm bg-purple px-3 font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
