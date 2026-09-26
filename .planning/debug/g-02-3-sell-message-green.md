---
status: diagnosed
trigger: "UAT G-02-3: Sell message shown in green color (SOLD 1 FIG @ 54.00)"
created: 2026-09-26T14:30:00Z
updated: 2026-09-26T14:36:00Z
goal: find_root_cause_only
symptoms_prefilled: true
---

## Current Focus

bug_class: Bohrbug (deterministic: every successful sell renders green)
hypothesis: CONFIRMED. TradeBar colors trade-result by result.ok only (never by side), and 02-UI-SPEC.md explicitly mandates text-up for a successful sell, so the green sell line is spec-conformant. The gap is a design-contract decision the user disagrees with, not a deviation from the spec.
candidate_causes:
  - "code: TradeBar.tsx:19 color = ok ? text-up : text-down; TradeResult has no side field (CONFIRMED)"
  - "spec/config: 02-UI-SPEC.md:172 sell success = text-up; :84 success = up green; :118 success state = text-up (CONFIRMED)"
  - "environment: stale Phase 1 container on [::1]:8000 (ELIMINATED - Phase 1 has no trade bar or Sold message)"
and_gate: "yes - the spec mandates green for every success AND the code implements exactly that; changing only the code would break the approved UI-SPEC, so both must change"
next_action: return ROOT CAUSE FOUND (goal find_root_cause_only)

## Symptoms

expected: Sell button is red; the trade-result line color should suit the result. User expects a successful sell's result line NOT to be green.
actual: "Sell message shown in green color (SOLD 1 FIG @ 54.00)"
errors: none reported
reproduction: UAT test 3. Sell a held position with the trade bar and look at the trade-result line.
started: discovered during Phase 02 UAT (2026-09-26)

## Eliminated

- hypothesis: The user saw a stale Phase 1 container (not the Phase 2 build)
  evidence: Phase 1 has no trade bar and no "Sold" copy; the only source of "Sold ... @ ..." is frontend/store/terminal.ts:82-83 (grep of components/app/store). A sell line proves the Phase 2 build.
  timestamp: 2026-09-26T14:35:00Z

- hypothesis: Implementation deviates from the UI-SPEC (executor bug)
  evidence: UI-SPEC Copywriting row for sell success (02-UI-SPEC.md:172) ends in "(text-up)"; Color table row (:84) lists "successful trade-result" under Up green; Trade bar contract (:118) says success = text-up. The code matches all three.
  timestamp: 2026-09-26T14:35:00Z

## Evidence

- timestamp: 2026-09-26T14:32:00Z
  checked: frontend/components/TradeBar.tsx:19
  found: `const color = result === null ? "text-muted" : result.ok ? "text-up" : "text-down";` The side is never consulted. Unchanged since 74e353a (git log -L).
  implication: every successful trade, buy or sell, renders text-up (#3fb950 green)

- timestamp: 2026-09-26T14:32:00Z
  checked: frontend/store/terminal.ts:26, 81-83
  found: TradeResult = { ok: boolean; text: string } with no side field; placeTrade returns ok: true for both "Bought" and "Sold"
  implication: TradeBar has no data to color by side even if it wanted to

- timestamp: 2026-09-26T14:33:00Z
  checked: frontend/out/_next/static/chunks/3myfk2-4cj0zy.js (built static export)
  found: same logic compiled, `l=null===h?"text-muted":h.ok?"text-up":"text-down"`; trade-result className `ml-2 min-w-0 flex-1 truncate font-mono text-xs ${l}` (no uppercase)
  implication: the shipped build behaves the same as the source

- timestamp: 2026-09-26T14:34:00Z
  checked: 02-UI-SPEC.md lines 84, 118, 172; 02-CONTEXT.md D-02 (line 24); 02-DISCUSSION-LOG.md
  found: UI-SPEC explicitly says sell success = `text-up` (`Sold 1 MSFT @ $415.30` (text-up)). D-02 says "On success it shows a green fill line" with only a buy example. The discussion log never asked the user about a sell-success color. UI-SPEC :82 made the Sell BUTTON red (bg-down) by user decision, but the result line was never tied to side.
  implication: the green sell line is a spec decision derived from D-02 without user input on sells; the user now rejects it

- timestamp: 2026-09-26T14:34:00Z
  checked: test/e2e/03-trading.spec.ts
  found: only toContainText assertions on trade-result (insufficient cash / shares); no color assertion
  implication: no E2E guards the result-line color; a change will not break spec 03

- timestamp: 2026-09-26T14:35:00Z
  checked: rendered text vs user quote "SOLD 1 FIG @ 54.00"
  found: trade-result has no `uppercase` class (only the ticker input does); formatPrice is Intl USD currency and always emits "$". Rendered text would be "Sold 1 FIG @ $54.00".
  implication: the user's quote is a paraphrase; the literal text cannot match. The color report is the substantive issue.

## Resolution

root_cause: The trade-result color is keyed only on success/failure (TradeBar.tsx:19, ok ? text-up : text-down), and TradeResult (terminal.ts:26) carries no side. This is exactly what 02-UI-SPEC.md prescribes (:84, :118, :172 "Sold ... (text-up)"), extended from CONTEXT D-02 "green fill line" without ever asking the user about sells. So every successful sell renders green. The code matches the approved contract, and the contract conflicts with the user's expectation that a sell result should not be green.
fix:
verification:
files_changed: []
