# Phase 1: Live Terminal in Docker - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-25
**Phase:** 01-live-terminal-in-docker
**Areas discussed:** Terminal layout skeleton, Price & status display, Frontend state approach, Backend verification depth

---

## Terminal layout skeleton

| Option | Description | Selected |
|--------|-------------|----------|
| 3-column | Watchlist left, chart + portfolio center with trade bar, chat right sidebar | |
| 2-column + bottom strip | Watchlist left, chart + trade bar center, chat drawer; heatmap/P&L/positions bottom strip | ✓ |
| You decide | Claude picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Empty titled panels | Full grid now, placeholders for later phases | ✓ |
| Only what exists | Each phase adds its region | |
| You decide | Claude picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Chat open by default | Ready to assist; collapsible | ✓ |
| Collapsed by default | More room for chart/portfolio | |
| You decide | Claude picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed full viewport | 100vh, panels scroll internally, stack below tablet | ✓ |
| Normal page scroll | Natural heights | |
| You decide | Claude picks | |

**User's choice:** 2-column + bottom strip; empty titled panels; chat open; fixed viewport.

---

## Price & status display

| Option | Description | Selected |
|--------|-------------|----------|
| Session change % | `session_change_percent`, stands in for daily change | ✓ |
| Tick change % | `change_percent` vs previous tick | |
| You decide | Claude picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dot + short label | LIVE / RECONNECTING / OFFLINE | ✓ |
| Dot only | Tooltip on hover | |
| You decide | Claude picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dim last price | Reduced opacity while not connected | ✓ |
| Unchanged | Only the dot signals outage | |
| You decide | Claude picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Seed from GET /api/watchlist | Real numbers immediately | ✓ |
| Placeholder dash | SSE only | |
| You decide | Claude picks | |

**User's choice:** Session %, dot + label, dim when stale, seed from REST.

---

## Frontend state approach

| Option | Description | Selected |
|--------|-------------|----------|
| Zustand store | Per-ticker selectors, ~1KB dep | ✓ |
| Plain React context + useState | Zero deps, whole-tree re-render per tick | |
| You decide | Claude picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Follow EventSource readyState | onopen/onerror/CLOSED mapping, native retry | ✓ |
| Time-based escalation | Red after ~10s without recovery | |
| You decide | Claude picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Research stack, TS 5.9 | Next 16, React 19, Tailwind 4, TS 5.9 | ✓ |
| Latest everything incl. TS 7 | Risk to Next type-check/ESLint | |
| You decide | Claude picks | |

**User's choice:** Zustand; readyState mapping; TS 5.9 stack.

---

## Backend verification depth

| Option | Description | Selected |
|--------|-------------|----------|
| Checklist + live smoke | PLAN.md §5–9 checklist + curl/SSE against running server; tests only for fixed gaps | ✓ |
| Code read-through only | Trust existing 75 tests | |
| Full test backfill | New tests for every PLAN.md behavior | |

| Option | Description | Selected |
|--------|-------------|----------|
| Leave CONCERNS.md soft issues | Fix only PLAN.md/spec breakers | ✓ |
| Fix the cheap ones | Tidy small items | |
| Case by case | Fix if user-visible | |

| Option | Description | Selected |
|--------|-------------|----------|
| Backend verify first | Verify → scaffold+Docker → header/watchlist/SSE → specs | ✓ |
| Frontend scaffold first | Unblock Docker first | |
| You decide | Planner picks | |

**User's choice:** Checklist + live smoke; leave soft issues; backend first.

---

## Claude's Discretion

- Number formatting (2-decimal $, signed 2-decimal %), panel proportions, fonts, placeholder copy, and internal `frontend/` structure.

## Deferred Ideas

None.
