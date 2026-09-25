"use client";

import { formatPrice } from "@/store/format";
import { useTerminal, type Status } from "@/store/terminal";

const STATUS_STYLE: Record<Status, { dot: string; label: string }> = {
  connected: { dot: "bg-up", label: "LIVE" },
  reconnecting: { dot: "bg-accent", label: "RECONNECTING" },
  disconnected: { dot: "bg-down", label: "OFFLINE" },
};

/** Top bar: brand, total value, cash, and the stream status dot. */
export function Header() {
  const totalValue = useTerminal((s) => s.totalValue);
  const cash = useTerminal((s) => s.cash);
  return (
    <header className="flex w-full items-center gap-6 border-b border-border bg-panel px-4 py-2">
      <span className="font-semibold text-accent">FinAlly</span>
      <Stat label="Total value">
        {totalValue !== null && <span data-testid="total-value">{formatPrice(totalValue)}</span>}
      </Stat>
      <Stat label="Cash">{cash !== null && <span data-testid="cash-balance">{formatPrice(cash)}</span>}</Stat>
      <div className="ml-auto">
        <ConnectionStatus />
      </div>
    </header>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-mono tabular-nums">{children}</span>
    </div>
  );
}

function ConnectionStatus() {
  const status = useTerminal((s) => s.status);
  const { dot, label } = STATUS_STYLE[status];
  return (
    <div data-testid="connection-status" data-status={status} role="status" className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="text-xs uppercase tracking-widest text-muted">{label}</span>
    </div>
  );
}
