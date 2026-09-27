---
phase: 02-trading-portfolio
reviewed: 2026-09-27T08:30:00Z
depth: standard
scope: incremental
diff_base: 4264d02adc97239708f9d177f78503adc9c5fc24
supersedes: 02-REVIEW.md reviewed 2026-09-26T08:15:17Z (full Phase 2 review)
files_reviewed: 7
files_reviewed_list:
  - frontend/README.md
  - frontend/app/page.tsx
  - frontend/components/TradeBar.tsx
  - frontend/package.json
  - frontend/store/portfolio.test.ts
  - frontend/store/terminal.ts
  - test/e2e/03-trading.spec.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 2: Code Review Report (incremental, gap closure 02-04 and 02-05)

**Reviewed:** 2026-09-27T08:30:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

> **Scope note:** This report replaces the earlier 02-REVIEW.md from 2026-09-26. It covers only the changes since `4264d02`, made by gap-closure plans 02-04 (G-02-1 trade bar clipping, G-02-3 sell result color) and 02-05 (G-02-5 Vitest runner and header-total order test). The earlier findings are not repeated or re-counted here. The code behind the earlier WR-01 (no in-flight guard, `TradeBar.tsx:24`) and WR-02 (`r.json()` outside the `try`, `terminal.ts:77-78`) did not change, so both are still open. With the new side-based colors, a non-JSON error response still leaves a previous green "Bought …" line on screen. The earlier WR-03, WR-04 and IN-01 to IN-04 concern files outside this scope and were not re-checked.

## Narrative Findings (AI reviewer)

## Summary

The G-02-1 and G-02-3 fixes are correct:
- The Trade panel no longer has a fixed `md:h-24`. It sizes to its content (`md:shrink-0`), and the TradeBar uses `min-h-16` in place of `h-full`, so wrapped controls can no longer be clipped.
- `resultColor` gives red for any rejection, green for a buy fill, and neutral text for a sell fill.
- `TradeResult.side` is set on all three return paths of `placeTrade`.

Checks I ran:
- `npm test` passes (2 tests).
- `tsc --noEmit` is clean. This matters because `next build` type-checks `store/portfolio.test.ts` through the `**/*.ts` include.
- `package-lock.json` matches `package.json` (`vitest` 5.0.2, `@types/node` ^24), so the Dockerfile's `npm ci` stays reproducible.

The main defect is in the G-02-5 test. It claims the header total does not depend on summation order, but that claim is false. The test passes only because its fixture total sits far from a half-cent boundary. I found realistic portfolios where reordering the positions changes the displayed total by one cent (see WR-01). The remaining items are test-strength and layout notes.

## Warnings

### WR-01: The order-independence test cannot fail, and the property it claims does not hold

**File:** `frontend/store/portfolio.test.ts:58-67`, `frontend/store/portfolio.ts:11`
**Issue:** G-02-5's truth is "Header total does not depend on the order positions are summed." The test checks this by summing 24 orderings and asserting that `formatPrice(total)` is `"$4,716.83"` each time. But `EXPECTED_TOTAL = 4716.834494` is 0.0005 away from the nearest rounding boundary (x.xx5). A last-bit float difference (about 1e-12 at this magnitude) can never change the displayed cents for this fixture. The assertion therefore holds no matter how `selectTotalValue` sums.

The property itself is false. `selectTotalValue` uses a plain float `reduce`, and near a half-cent the rounded display depends on order. I reproduced this with the same reduce shape, starting from cash:

```
cash 7916.37; A = 4.368 @ 370.93, B = 4.348 @ 487.04, C = 6.396 @ 38.29
order A,B,C -> 11899.145            -> "$11,899.15"
order B,A,C -> 11899.144999999999   -> "$11,899.14"
```

A random search found such cases often (3 hits in well under 2M trials with 3 positions). The runtime impact is small today, because the backend returns positions `ORDER BY ticker` (`backend/app/portfolio.py:73`). Even so, the unit test gives false assurance for the exact property the gap asked it to prove. Also, the float sum does not match the backend's `total_value`: the backend rounds each position's `market_value` to cents before summing (`backend/app/portfolio.py:87,92`).

**Fix:** Sum in integer cents. Integer addition below 2^53 is exact, so the total really is order-independent, and it matches the backend's per-position rounding. Then add the boundary fixture to the test and assert exact equality.

```ts
// portfolio.ts
export function selectTotalValue(s: TerminalState): number | null {
  if (s.cash === null) return null;
  const cents = s.positions.reduce(
    (sum, p) => sum + Math.round(p.quantity * livePrice(p, s.prices) * 100),
    Math.round(s.cash * 100),
  );
  return cents / 100;
}
```

```ts
// portfolio.test.ts: a fixture that sits on a half-cent boundary
const boundary: Position[] = [
  { ticker: "A", quantity: 4.368, avg_cost: 1, current_price: 370.93 },
  { ticker: "B", quantity: 4.348, avg_cost: 1, current_price: 487.04 },
  { ticker: "C", quantity: 6.396, avg_cost: 1, current_price: 38.29 },
];
// with cash 7916.37 and no live prices, every permutation must give toBe(sameValue) exactly
```

If you keep the float sum, change the G-02-5 truth and the test comment to what actually holds ("orderings agree within 1e-9"). Do not claim the displayed header total is order-independent.

## Info

### IN-01: The sell-color assertion also matches inherited text, and the rejected-sell color is not checked

**File:** `test/e2e/03-trading.spec.ts:30`, `test/e2e/03-trading.spec.ts:49-50`
**Issue:** The sell-fill assertion expects `rgb(230, 237, 243)`, which is `--color-text`. The body also uses that color (`frontend/app/globals.css:8,18`). If `resultColor` stopped returning a class for sells, the `<p>` would inherit the same color and the test would still pass. The test does catch the original G-02-3 bug (a green sell), but it does not pin `text-text`. The new code also has a branch where `!r.ok` must be checked before `side`. Only the rejected buy's color is asserted (line 47). Nothing checks that a rejected sell ("insufficient shares") is red, so if those checks were reordered, a failed sell would show in neutral text without any test failing.
**Fix:** After line 50, add `await expect(page.getByTestId("trade-result")).toHaveCSS("color", "rgb(248, 81, 73)");`. For the sell fill, add `await expect(page.getByTestId("trade-result")).toHaveClass(/\btext-text\b/);` or assert that the color is not the buy green.

### IN-02: E2E color literals duplicate the theme tokens

**File:** `test/e2e/03-trading.spec.ts:15`, `:30`, `:47`
**Issue:** `rgb(63, 185, 80)`, `rgb(230, 237, 243)` and `rgb(248, 81, 73)` are hand-converted copies of `--color-up`, `--color-text` and `--color-down` (`frontend/app/globals.css:8,12,13`). No comment ties them together, so a theme tweak breaks three tests with messages that don't name the token.
**Fix:** Name them once in `test/e2e/helpers.ts`, for example `export const COLOR = { up: "rgb(63, 185, 80)", text: "rgb(230, 237, 243)", down: "rgb(248, 81, 73)" }; // globals.css --color-*`.

### IN-03: At 768-850 px the content-sized Trade panel takes its height from the Chart panel, and the E2E test covers only 768x600

**File:** `frontend/app/page.tsx:29-34`, `frontend/components/TradeBar.tsx:28`, `test/e2e/03-trading.spec.ts:56-61`
**Issue:** With the chat drawer open (the default), the center column at 768 px is about 144 px wide: 768 minus `md:w-72`, `md:w-80`, padding and gaps. The TradeBar wraps to one control per row: ticker, quantity, Buy, Sell, and the result line. That makes the Trade panel about 200 px tall, and the `md:flex-1 md:min-h-0` Chart panel absorbs the difference. By CSS arithmetic, the chart is left with roughly 140 px at 768x600. I estimated this and did not measure it, because the sandbox blocked launching Chromium. The price chart arrives in Phase 3 and will be cramped at these widths. When the result `<p>` wraps onto its own row, its `ml-2` indents it 8 px relative to the controls above it. The new E2E test checks only the narrowest point of the 768-850 px range named in the G-02-1 truth.
**Fix:** Nothing is needed for Phase 2. In Phase 3, give the Chart panel a minimum height at `md` (for example `md:min-h-40`), or collapse the chat drawer by default below `lg`. Optionally, run the viewport test at both 768 and 850 px widths.

---

_Reviewed: 2026-09-27T08:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
