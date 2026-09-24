"use client";
/** Brand, live account totals and SSE connection status. */
import { useFlash } from "@/hooks/useFlash";
import { money, signedMoney, trendClass } from "@/lib/format";
import type { ConnectionStatus, Portfolio } from "@/lib/types";

const STATUS: Record<ConnectionStatus, { color: string; label: string }> = {
  connecting: { color: "bg-accent", label: "Connecting" },
  connected: { color: "bg-up", label: "Live" },
  reconnecting: { color: "bg-accent", label: "Reconnecting" },
  disconnected: { color: "bg-down", label: "Disconnected" },
};

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[11px] text-muted">{label}</span>
      {children}
    </div>
  );
}

export function Header({ portfolio, status }: { portfolio: Portfolio | null; status: ConnectionStatus }) {
  const total = portfolio?.total_value;
  const flash = useFlash(total === undefined ? undefined : Math.round(total * 100));
  const { color, label } = STATUS[status];
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
      <h1 className="text-xl font-semibold tracking-tight">
        Fin<span className="text-accent">Ally</span>
      </h1>
      <div className="ml-auto flex items-center gap-5 lg:gap-8">
        <Stat label="Portfolio value">
          <span
            data-testid="total-value"
            className={`flash-cell rounded-sm px-1 text-2xl font-semibold text-accent ${flash ? `flash-${flash}` : ""}`}
          >
            {total === undefined ? "—" : money(total)}
          </span>
        </Stat>
        <Stat label="Unrealized P&L">
          <span data-testid="unrealized-pnl" className={`text-base font-medium ${trendClass(portfolio?.unrealized_pnl ?? 0)}`}>
            {portfolio ? signedMoney(portfolio.unrealized_pnl) : "—"}
          </span>
        </Stat>
        <Stat label="Cash">
          <span data-testid="cash-balance" className="text-base font-medium">
            {portfolio ? money(portfolio.cash_balance) : "—"}
          </span>
        </Stat>
        <div data-testid="connection-status" data-status={status} className="flex items-center gap-2 text-muted" title={label}>
          <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
          <span>{label}</span>
        </div>
      </div>
    </header>
  );
}
