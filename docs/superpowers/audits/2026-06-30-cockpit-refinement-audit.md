# Cockpit Refinement — Professional Audit

Date: 2026-06-30
Branch: `redesign/tomo-dark`
Scope: spec `2026-06-29-cockpit-refinement-design.md`, plan `2026-06-29-cockpit-refinement.md`

## Gate

| Check | Result |
|-------|--------|
| `tsc --noEmit` | clean |
| `npm test` | 132 passed (24 files) |
| `npm run lint` | clean (lint = tsc) |

A pre-existing failure (`App.test.tsx` "Overall status", stale since the redesign commit) was fixed during the flatten.

## Steering — verified end-to-end (live API)

- `POST /api/direction` → returns `{ text, updatedAt }`.
- `GET /api/direction` → persists.
- `GET /api/dashboard` → `direction` present in bootstrap (survives reload).
- empty/whitespace text → clears to `null`.
- **Real generate run** with a direction set: confirmed the text reached the model job —
  - `prompt.md` line: `Casey's current creative direction (follow it): …`
  - `input.json`: `"direction": "…"`
- Prompt block is absent when direction is null (unit-tested + back-compat).

## Accessibility

- Global focus ring: `summary/button/a:focus-visible { outline: 2px solid var(--focus) }` — covers every flattened button, the toggles, and the copy/save actions.
- Direction textarea: `aria-label`, custom accent focus ring (`box-shadow` + `--accent-line`).
- Live regions: updated-stamp `aria-live="polite"`, save button `aria-busy`, run-status `aria-live`.
- Disabled save state is non-interactive until the field is dirty (prevents no-op saves).

## Motion

- Tokens: `--ease-spring`, `--ease-out`, `--dur-fast/base/slow`.
- Staggered card entrances, button press scale, copy/save pop, disclosure reveal.
- Reduced-motion: existing global block `* { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important }` neutralizes all new motion — no per-rule gating needed. Code-verified.

## Spacing / layout

- `--space-1..8` scale added; sidebar, strategy summary, scorecard head/copy normalized to it.
- Command center content edges align (verified at ~993px and ~1100px widths).
- Responsive breakpoints intact at 980 / 860 / 520px.

## Flatten

- Command center: Status signals + Score breakdown now inline (zero clicks).
- Run log un-nested into the single Evidence disclosure.
- Max disclosure depth across the app = 1 layer. Toggle iconography unified (`+`/`-`; Strategy engine's odd `v` removed).

## Deviations from plan (intentional)

1. **Evidence panel kept as the single disclosure** with the Run log inlined inside it, rather than promoting Evidence to always-open. The live screenshot showed an always-open Evidence panel would *add* to the collapsed-panel stack at the bottom — the opposite of the "reduce the wall" goal. The max-one-layer rule is still satisfied.
2. **Direction chip skipped (YAGNI).** The card sits directly under the command center beside the Generate actions and its textarea shows the live direction, so a separate echo chip was redundant.

## Deferred / not blocking

- Audit-mode (non-generated) command center verified by test (`317`), not re-screenshotted (local DB holds a generation; not cleared to preserve Casey's data).
- Dead CSS for the removed disclosures (`.command-center-signal-disclosure …`, `.scorecard-breakdown summary …`, `.action-progress-summary …`) was deleted in a follow-up commit; shared selectors (`.scorecard-dimension-top span`, `.command-center-maintenance` toggle) were split out and preserved. Verified no visual regression.

## Verdict

All spec sections implemented and verified. Gate green. Steering proven through the real generation path. Ship-ready on the branch.
