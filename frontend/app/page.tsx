"use client";

import { useEffect } from "react";
import { ChatDrawer } from "@/components/ChatDrawer";
import { Header } from "@/components/Header";
import { Panel, PanelNote } from "@/components/Panel";
import { Watchlist } from "@/components/Watchlist";
import { connect } from "@/store/terminal";

/** Stacked panels stay visible on narrow screens; the grid sizes them at md and up. */
const STACKED = "min-h-48 md:min-h-0";

export default function Page() {
  useEffect(connect, []);
  return (
    <main className="flex min-h-screen flex-col gap-1 bg-bg md:h-screen md:overflow-hidden">
      <div className="shrink-0">
        <Header />
      </div>
      <div className="flex flex-col gap-1 px-1 md:min-h-0 md:flex-1 md:flex-row">
        <Panel title="Watchlist" className={`${STACKED} md:w-72 md:shrink-0`}>
          <Watchlist />
        </Panel>
        <div className="flex min-w-0 flex-col gap-1 md:flex-1">
          <Panel title="Chart" className={`${STACKED} md:flex-1`}>
            <PanelNote>The price chart for the selected ticker arrives in Phase 3.</PanelNote>
          </Panel>
          <Panel title="Trade" className={`${STACKED} md:h-24 md:shrink-0`}>
            <PanelNote>The trade bar arrives in Phase 2.</PanelNote>
          </Panel>
        </div>
        <ChatDrawer />
      </div>
      <div className="grid grid-cols-1 gap-1 px-1 pb-1 md:h-[32%] md:shrink-0 md:grid-cols-[1fr_1fr_1.3fr]">
        <Panel title="Heatmap" className={STACKED}>
          <PanelNote>The portfolio heatmap arrives in Phase 2.</PanelNote>
        </Panel>
        <Panel title="P&L" className={STACKED}>
          <PanelNote>The portfolio value chart arrives in Phase 2.</PanelNote>
        </Panel>
        <Panel title="Positions" className={STACKED}>
          <PanelNote>The positions table arrives in Phase 2.</PanelNote>
        </Panel>
      </div>
    </main>
  );
}
