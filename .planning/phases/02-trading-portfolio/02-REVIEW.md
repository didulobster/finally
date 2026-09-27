---
phase: 02-trading-portfolio
reviewed: 2026-09-27T02:28:53Z
depth: standard
scope: incremental
diff_base: 268043ad169ba0f2b9b4712f723f2aa4263a81a5
supersedes: 02-REVIEW.md with diff_base 4264d02 (the 268043a review, gap closure 02-04 and 02-05)
files_reviewed: 2
files_reviewed_list:
  - frontend/store/portfolio.ts
  - frontend/store/portfolio.test.ts
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 2: Code Review Report (incremental, gap closure 02-07)

**Reviewed:** 2026-09-27T02:28:53Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

> **Scope note:** This report replaces the 02-REVIEW.md written at `268043a`. It covers only the changes since `268043a`, made by gap-closure plan 02-07 (G-02-5: sum the header total in whole cents). Only `frontend/store/portfolio.ts` and `frontend/store/portfolio.test.ts` changed in source.
>
> **WR-01 of the 268043a review is addressed.** I checked this myself. `selectTotalValue` now sums integer cents (`portfolio.ts:9-20`). Integers below 2^53 add exactly, so the total cannot depend on the order of positions. The test uses the half-cent fixture from that review and asserts exact equality (`toBe`) across all 6 orders (`portfolio.test.ts:76-83`). Against the old float `reduce`, this test and the one at `:85-90` would fail, so they now guard the property.
>
> **Carried forward as still open.** `git log 268043a..HEAD` shows no change to `frontend/components/TradeBar.tsx`, `frontend/store/terminal.ts`, `frontend/app/page.tsx` or `test/e2e/03-trading.spec.ts`. So these earlier findings still stand:
> - the in-flight guard (now WR-02)
> - `r.json()` outside the `try` (now WR-03)
> - the 268043a review's IN-01 to IN-03 (now IN-01 to IN-03)
>
> They are listed briefly below and included in the counts. The older 2026-09-26 review's WR-03, WR-04 and IN-01 to IN-04 were not re-checked. They are not counted here.

## Narrative Findings (AI reviewer)

## Summary

The integer-cents sum works. It is exact and order-independent, and it returns `total / 100`, which is the double nearest the cent value, so `formatPrice` shows the right cents.

Checks I ran:
- `npx vitest run store/portfolio.test.ts`: 5 tests pass.
- `tsc --noEmit`: clean.

One new defect: the docstring says the per-position rounding works "as the backend does", and one test is named "rounds a half-cent boundary total the way the backend does". That claim is false. JS `Math.round(v * 100)` and Python `round(v, 2)` round differently at per-position half cents. For realistic fractional holdings, the header total drifts one cent from the backend's `total_value`, which feeds the P&L snapshots. The boundary fixture never tests this, because none of its positions falls on a half cent (see WR-01).

## Warnings

### WR-01: Per-position cents do not round "as the backend does", so the header can differ from the backend total by a cent per position

**File:** `frontend/store/portfolio.ts:9-11`, `frontend/store/portfolio.ts:14`, `frontend/store/portfolio.test.ts:85-90`
**Issue:** The two sides round differently.
- **Frontend:** `cents(v) = Math.round(v * 100)`. The multiply by 100 is itself a float operation and can round a value just below a half cent up to exactly `.5`. `Math.round` then rounds ties up.
- **Backend:** `get_portfolio` uses Python `round(market_value, 2)` (`backend/app/portfolio.py:87`). That rounds the exact binary value, and exact ties go to the even digit. The rounded values are then summed into `total_value` (`:92,96`), which `record_snapshot` stores for the P&L chart.

I compared the two rules over 2-decimal prices $10.00 to $499.99, the precision the price cache keeps (`backend/app/market/cache.py:23`), and a handful of quantities. They disagree in 40,306 of 441,000 cases. At quantity 0.5 they disagree for about 23% of prices. Examples, as backend vs frontend:

```
0.5 x 190.25 = 95.125 exactly   -> backend 95.12, header 95.13
0.5 x 190.13                     -> backend 95.06, header 95.07
cash 9904.87 + 0.5 x 190.13      -> backend total_value 9999.93, header $9,999.94
cash 9904.87 + 0.5 x 190.25      -> backend total_value 9999.99, header $10,000.00
```

Fractional shares are supported (`quantity: float = Field(gt=0)`, `backend/app/api.py:17`), so holding half a share is a normal case. When it happens, the header total and the latest P&L snapshot for the same prices show different values. The Heatmap tooltip also disagrees with the header in the non-exact case: it formats the raw `p.quantity * live` with `Intl` (`frontend/components/Heatmap.tsx:42`), which rounds the exact binary value.

The test at `portfolio.test.ts:85-90` cannot catch this. Its positions are worth 1620.22224, 2117.64992 and 244.90284, none of them near a half cent. The "half-cent boundary" in the fixture's comment (`:16`) exists only in the old raw float sum. So the test proves the new code differs from the old float sum. It does not prove the new code matches the backend.

**Fix:** Pick one rounding rule and use it on both sides. The simplest match is for the backend to use the same round-half-up-after-×100 rule as the frontend. Both sides compute the same IEEE double for `v * 100`, and for positive values `floor(x + 0.5)` equals `Math.round(x)`:

```python
# backend/app/portfolio.py
def to_cents(v: float) -> float:
    """Round a dollar amount to cents the way the frontend header does (half up after x100)."""
    return math.floor(v * 100 + 0.5) / 100
# use to_cents(market_value) in place of round(market_value, 2)
```

Then add a real per-position tie to the frontend test, so the claim is checked:

```ts
it("rounds a per-position half cent the way the backend does", () => {
  const half: Position[] = [{ ticker: "X", quantity: 0.5, avg_cost: 1, current_price: 190.13 }];
  expect(selectTotalValue(stateWith(half, 9904.87))).toBe(/* backend total_value for the same input */);
});
```

If you don't want to change the backend, remove "as the backend does" from the docstring at `portfolio.ts:14`, rename the test at `:85`, and accept that the header and the snapshot can differ by one cent per position.

### WR-02 (carried forward, unchanged): TradeBar has no in-flight guard

**File:** `frontend/components/TradeBar.tsx:24`
**Issue:** `trade` awaits `placeTrade` without disabling Buy or Sell. A double-click sends two market orders, and the results can arrive out of order, so the line on screen may describe the older order. The code has not changed since the earlier review.
**Fix:** Keep a `pending` state. Set it before the `await` and clear it in `finally`. Pass `disabled={pending}` to both buttons.

### WR-03 (carried forward, unchanged): `r.json()` runs outside the `try` in `placeTrade`

**File:** `frontend/store/terminal.ts:77-78`
**Issue:** If the server sends a non-JSON response (for example a proxy 502 HTML page, or an empty body), `await r.json()` throws. The rejection escapes `TradeBar`'s `trade` handler as an unhandled promise rejection. The previous result stays on screen, which can be a green "Bought …" from an earlier fill. The code has not changed since the earlier review.
**Fix:** Parse inside a `try` and return a rejection result when parsing fails:

```ts
let body;
try { body = await r.json(); } catch { return { ok: false, side, text: `Trade failed: server error (${r.status}).` }; }
```

## Info

These three items are carried forward unchanged from the 268043a review (IN-01 to IN-03). The files they cite did not change.

### IN-01: The sell-color E2E assertion matches inherited text, and the rejected-sell color is not checked

**File:** `test/e2e/03-trading.spec.ts:30`, `:49-50`
**Issue:** The sell-fill color `rgb(230, 237, 243)` equals the body's inherited `--color-text`, so the test would pass even if `resultColor` returned nothing for sells. Nothing checks that a rejected sell is red.
**Fix:** Assert `toHaveClass(/\btext-text\b/)` for the sell fill. Assert `rgb(248, 81, 73)` after the rejected sell.

### IN-02: E2E color literals duplicate the theme tokens

**File:** `test/e2e/03-trading.spec.ts:15`, `:30`, `:47`
**Issue:** The three `rgb(...)` literals are hand-converted copies of `--color-up`, `--color-text` and `--color-down`, and no comment ties them to those tokens.
**Fix:** Name them once in `test/e2e/helpers.ts`, with a comment that points at `globals.css`.

### IN-03: At 768-850 px the content-sized Trade panel takes its height from the Chart panel

**File:** `frontend/app/page.tsx:29-34`, `frontend/components/TradeBar.tsx:28`, `test/e2e/03-trading.spec.ts:56-61`
**Issue:** With the chat drawer open, the TradeBar wraps to one control per row. By my estimate, which I did not measure, that leaves the Chart panel about 140 px at 768x600. The viewport test checks only 768 px wide.
**Fix:** In Phase 3, give the Chart panel a minimum height at `md`, or collapse the chat drawer below `lg`. Optionally, run the viewport test at 850 px as well.

---

_Reviewed: 2026-09-27T02:28:53Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
