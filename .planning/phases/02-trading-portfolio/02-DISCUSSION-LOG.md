# Phase 2: Trading & Portfolio - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-26
**Phase:** 02-trading-portfolio
**Areas discussed:** Trade bar behavior, Live portfolio math, P&L chart behavior

---

## Trade bar behavior

| Question | Options | Selected |
|----------|---------|----------|
| Inputs after a successful trade | Keep both / Clear quantity only / Clear both | Keep both |
| trade-result behavior | Persist until next trade / Auto-fade after ~4s | Persist until next trade |
| Watchlist click prefills ticker | No, typed only for now / Yes, now | No, typed only for now |
| Disable Buy/Sell while in flight | Disable both buttons / No, leave enabled | No, leave enabled |

---

## Live portfolio math

| Question | Options | Selected |
|----------|---------|----------|
| Keep total value and P&L live | Client-side recompute / Refetch /api/portfolio periodically | Client-side recompute |
| Post-trade store update | Use the trade response's portfolio / Refetch /api/portfolio after | Use the trade response's portfolio |
| Live columns in positions table | Price, P&L, % all live / Snapshot values only | Price, P&L, % all live |
| Row order | Alphabetical by ticker / By market value, desc | Alphabetical by ticker |

---

## P&L chart behavior

| Question | Options | Selected |
|----------|---------|----------|
| Refresh cadence | On load, after each trade, and every 30s / On load and after trades only | On load, after each trade, and every 30s |
| Live point | No, snapshots only / Yes, append a live last point | No, snapshots only |
| Style | Area chart colored vs $10k start / Plain blue line / Baseline series at $10k | Area chart colored vs $10k start |
| Range | All snapshots, fit to width / Only the current session | All snapshots, fit to width |

---

## Claude's Discretion

- Heatmap (not selected for discussion): treemap implementation, tile content, color scale, within spec 04 constraints
- Trade bar layout, empty states, number formatting

## Deferred Ideas

- Clicking a watchlist row prefills the trade ticker (Phase 3)
