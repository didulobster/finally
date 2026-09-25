"use client";

import { useState } from "react";
import { PanelNote } from "@/components/Panel";

const TOGGLE = "px-2 text-muted hover:text-accent";

/** Right-hand AI Assistant drawer: open on load, collapses to a thin edge tab. */
export function ChatDrawer() {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <aside className="flex shrink-0 flex-col items-center gap-3 border border-border bg-panel py-2 md:w-8">
        <button type="button" aria-label="Expand chat" aria-expanded={false} onClick={() => setOpen(true)} className={TOGGLE}>
          «
        </button>
        <span className="text-[11px] uppercase tracking-widest text-muted [writing-mode:vertical-rl]">AI</span>
      </aside>
    );
  }
  return (
    <aside className="flex min-h-48 shrink-0 flex-col border border-border bg-panel md:min-h-0 md:w-80">
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-border pl-3">
        <h2 className="text-[11px] uppercase tracking-widest text-muted">AI Assistant</h2>
        <button type="button" aria-label="Collapse chat" aria-expanded={true} onClick={() => setOpen(false)} className={TOGGLE}>
          »
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <PanelNote>The AI assistant arrives in Phase 4.</PanelNote>
      </div>
    </aside>
  );
}
