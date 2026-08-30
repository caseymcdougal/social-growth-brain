# Social Audit Cockpit Refinement Design

Date: 2026-06-29
Owner: Casey McDougal
Status: Approved (design confirmed in session)

## Goal

Refine the existing tomo-dark X audit cockpit so it feels finished and intentional: consistent spacing, expressive-but-tasteful motion on all feedback, a flatter and more intuitive information architecture, and a new natural-language steering control that lets Casey guide what the AI generates. Close with a professional design/UX/code audit.

This is a refinement of the current app on branch `redesign/tomo-dark`, not a rebuild. Follow existing patterns, tokens, and component boundaries.

## Scope

In scope:

- Spacing/margin consistency across every panel, card, and grid.
- An expressive motion + feedback layer (entrances, button feedback, panel expand, success, meter fills), gated behind `prefers-reduced-motion`.
- Flatten the information architecture so the core scan -> rank -> diagnose -> write path is inline and at most one disclosure layer remains anywhere.
- A persistent "Creative direction" steering note that feeds all three AI runners (ideas, topic exploration, strategy memory).
- A final professional audit pass.

Out of scope (YAGNI):

- Direction history/versioning. Latest text only.
- Per-runner direction overrides. One note feeds all three runners.
- New runtime dependencies. CSS for motion, existing `better-sqlite3` for persistence.
- Any change to capture, the analysis model contract, X API, or scheduling.

## 1. Spacing System

Establish a spacing scale as CSS custom properties on `:root`:

```
--space-1: 4px;  --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
--space-5: 24px; --space-6: 32px;  --space-7: 48px;  --space-8: 64px;
```

Then sweep `src/styles.css`:

- Replace ad-hoc panel padding / gaps / margins with scale tokens.
- Standardize panel anatomy: every `.panel` uses the same inner padding and the same eyebrow -> title -> body vertical rhythm, so headers align across panels at the same viewport.
- Normalize inter-panel spacing in `.workspace` (the existing `margin-top: 18px` adjacency rule generalizes to `--space-5`).
- Audit the grids (`.command-center-grid`, `.dashboard-grid`, `.operations-grid`, `.scorecard-dimensions`) for equal gaps and aligned card padding.

No structural HTML change is required for spacing; this is a CSS-token sweep.

## 2. Motion Layer (expressive / lively)

Add easing + duration tokens on `:root`:

```
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);  /* overshoot */
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
--dur-fast: 140ms; --dur-base: 220ms; --dur-slow: 380ms;
```

Effects (CSS keyframes + transitions, no JS animation libs):

- **Panel/card entrance:** fade + rise on mount, staggered across siblings via `animation-delay` (nth-child steps). Applies to command-center cards, opportunity cards, scorecard dimensions, post queue items.
- **Button feedback:** press = scale(0.97) + accent glow; hover lift. Reuse existing button transition, extend with spring.
- **Disclosure expand:** spring height/opacity when a `<details>`/panel opens.
- **Success:** copy / save actions get a check-pop (scale overshoot) on confirm. Reuse existing copied-state pattern.
- **Meters:** scorecard + signal meter widths animate with `--ease-out` (already partly present at `transition: width 180ms`).
- **Status dot:** keep the running pulse; ensure it uses the spring/eased loop.

All new motion sits inside the work, and the existing `@media (prefers-reduced-motion: reduce)` block (styles.css ~L4181) is extended to disable every new entrance/transform so reduced-motion users get instant, static UI.

## 3. Flatten Information Architecture

Current state nests disclosures up to two deep (Command center -> Status signals / Score breakdown; Evidence details -> Run log; Strategy engine -> tabs). Target: **at most one disclosure layer anywhere**, core path always inline.

Changes in `src/App.tsx`:

- **Command center:** un-nest the `command-center-signal-disclosure` (Status signals) and `scorecard-breakdown` (Score breakdown) `<details>` into an inline compact strip. The three command signals and the dimension meters render directly, no click to reveal.
- **Evidence details:** promote from a `<details>` to a normal inline `.panel`. Fold the **Run log** (`ActionProgressPanel`) in as a sibling block inside it rather than a nested `<details>` — collapse only when idle, auto-expand on activity (keep existing `shouldOpen` logic, applied to the single layer).
- **Strategy engine:** keep as the one remaining advanced collapsible (tabs preserved). This is the single allowed disclosure for genuinely secondary tools.
- Result: max depth = 1 disclosure (Strategy engine), everything else inline.

Keep the `is-generated` (draft handoff) mode behavior; apply the same flatten there.

## 4. Creative Direction (natural-language steering)

A persistent free-text note Casey edits to steer generation ("move away from crypto takes, lean into build-in-public + tools"). It is injected into every AI run.

### Data

New SQLite table, latest-wins single value:

```
creative_direction(id INTEGER PK, text TEXT NOT NULL, updated_at TEXT NOT NULL)
```

Repository (`src/server/repositories.ts`):

- `getCreativeDirection(): { text: string; updatedAt: string } | null` — most recent row.
- `setCreativeDirection(text: string): { text; updatedAt }` — inserts a new row (history not exposed; latest wins on read).

Empty/whitespace text clears the direction (delete or store empty -> treated as none).

### API

- `GET /api/direction` -> `{ ok, direction: { text, updatedAt } | null }`.
- `POST /api/direction` `{ text }` -> validates, saves, returns saved direction.
- Fold the current direction into `GET /api/dashboard` so it bootstraps with the rest of the state and survives reload (added to `DashboardState`).

Client `src/client/api.ts`: `getCreativeDirection()` (covered by dashboard bootstrap), `saveCreativeDirection(text)`.

### Injection

Thread an optional `direction: string | null` through the three runners and their codex prompt builders:

- `generateToday({ snapshot, analysis, direction, jobDir })`
- `generateMemoryProposal({ snapshot, analysis, currentMemory, direction, jobDir })`
- `exploreTopics / exploreNearbyTopics({ ..., direction, jobDir })`

Each prompt gains a block, only when direction is non-empty:

```
Casey's current creative direction (follow it): <text>
```

and `direction` is added to the run's `input.json`. Routes read `repos.getCreativeDirection()` and pass it in. When direction is null, prompts are unchanged (back-compat).

### UI

- A **Creative direction** card near the top of the workspace (under the command center): a `<textarea>`, a Save button, and an "updated <relative time>" stamp. Save calls `saveCreativeDirection`, shows a check-pop on success.
- When a direction is set, a compact chip echoing it renders next to the Generate actions so the steering state is always visible while generating.
- State lives in `App.tsx` alongside the other dashboard state; bootstrapped from `/api/dashboard`.

## 5. Final Professional Audit

After implementation, a QA pass:

- Spacing: every panel/card/grid aligns to the scale; no orphan px margins; headers align across panels at common breakpoints.
- Motion: consistent tokens; entrances staggered not janky; reduced-motion fully static.
- A11y: focus states on the new direction control + flattened buttons; contrast on dark theme; `aria-live` on save/run feedback.
- Steering flow end-to-end: set direction -> generate -> confirm direction text reaches `input.json` and prompt.
- `npm test` and `tsc --noEmit` green; lint clean.
- Report findings + fixes.

## Testing

- Unit: a repository test for `set/getCreativeDirection` (latest-wins, empty clears). Reuse existing test setup (`*.test.tsx` / vitest).
- A prompt-build test asserting the direction block appears when set and is absent when null (extend existing generation runner job-file test if present).
- Existing `App.test.tsx` and `PostBreakdown.test.tsx` must stay green after the flatten.

## Risks / Notes

- Flattening removes `<details>` wrappers that tests or scroll handlers may reference (`handleReviewDraftQueue`, `handleStrategyEngineTabChange` query selectors). Update selectors when the wrappers change.
- The dirty `styles.css` working-tree changes (spacing/toggle tweaks) are consistent with this work and are kept.
