import type { ReactNode } from "react";

/** Titled terminal panel whose body scrolls internally. */
export function Panel({ title, children, className = "" }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <section className={`flex min-h-0 flex-col border border-border bg-panel ${className}`}>
      <h2 className="flex h-7 shrink-0 items-center border-b border-border px-3 text-[11px] uppercase tracking-widest text-muted">
        {title}
      </h2>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

/** Muted body text for a panel that a later phase fills in. */
export function PanelNote({ children }: { children: ReactNode }) {
  return <p className="p-3 text-xs text-muted">{children}</p>;
}
