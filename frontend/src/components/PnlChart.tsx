"use client";
/** Total portfolio value over time from recorded snapshots. */
import { useMemo } from "react";
import type { Snapshot } from "@/lib/types";
import { Panel } from "./Panel";
import { TimeChart } from "./TimeChart";

export function PnlChart({ snapshots }: { snapshots: Snapshot[] }) {
  const points = useMemo(
    () => snapshots.map((s) => ({ time: Date.parse(s.recorded_at) / 1000, value: s.total_value })),
    [snapshots],
  );
  return (
    <Panel title="Portfolio value">
      <TimeChart points={points} color="#ecad0a" testId="pnl-chart" />
    </Panel>
  );
}
