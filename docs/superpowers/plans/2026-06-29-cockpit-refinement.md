# Cockpit Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the tomo-dark X audit cockpit: consistent spacing, expressive motion, flatter IA, and a persistent natural-language steering note that feeds all AI runs.

**Architecture:** CSS-token sweep for spacing + motion in `src/styles.css`. A new `creative_direction` SQLite table + repo + API threaded into the three codex runners' prompt builders. `App.tsx` flattened to at most one disclosure layer, plus a new Creative Direction card.

**Tech Stack:** Preact/React + Vite, Express, better-sqlite3, vitest. No new runtime deps.

## Global Constraints

- No new runtime dependencies. Motion = CSS only; persistence = existing better-sqlite3.
- Latest-wins direction; no history/versioning surfaced; empty text clears it.
- One direction note feeds all three runners (generation, memory, topics); no per-runner overrides.
- All new motion gated behind existing `@media (prefers-reduced-motion: reduce)` block.
- Max one disclosure (`<details>`) nesting layer anywhere in the UI; core path inline.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. No "Generated with Claude Code" footer.

---

## File Structure

- `src/server/db.ts` — add `creative_direction` table to schema exec block.
- `src/server/repositories.ts` — add `getCreativeDirection` / `setCreativeDirection`.
- `src/server/repositories.test.ts` — **new**, repo unit test.
- `src/server/routes.ts` — add `GET/POST /api/direction`; thread direction into generate/memory/topics routes; add direction to `/api/dashboard`.
- `src/server/generation/generation-runner.ts` + `codex-generation-runner.ts` — `direction` param + prompt block.
- `src/server/strategy/strategy-intelligence-runner.ts` + `codex-strategy-intelligence-runner.ts` — `direction` param + prompt block.
- `src/server/generation/codex-generation-runner.test.ts` — **new**, prompt-build test.
- `src/client/api.ts` — `saveCreativeDirection`; `direction` in `DashboardState`.
- `src/client/components/CreativeDirectionCard.tsx` — **new**.
- `src/App.tsx` — flatten IA; mount Creative Direction card + chip; wire state.
- `src/styles.css` — spacing scale, motion tokens/keyframes, flatten styles, card styles, reduced-motion extension.

---

## Task 1: Creative direction persistence

**Files:**
- Modify: `src/server/db.ts` (schema exec block, after `topic_exploration_runs`)
- Modify: `src/server/repositories.ts`
- Test: `src/server/repositories.test.ts` (create)

**Interfaces:**
- Produces: `getCreativeDirection(): { text: string; updatedAt: string } | null`, `setCreativeDirection(text: string): { text: string; updatedAt: string } | null` (null when cleared by empty text).

- [ ] **Step 1: Add table to schema.** In `src/server/db.ts`, inside the `db.exec(\`...\`)` block, append:

```sql
CREATE TABLE IF NOT EXISTS creative_direction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- [ ] **Step 2: Write the failing test.** Create `src/server/repositories.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "./db";
import { createRepositories } from "./repositories";

function freshRepos() {
  const db = new Database(":memory:");
  initSchema(db);
  return createRepositories(db);
}

describe("creative direction", () => {
  it("returns null when unset", () => {
    expect(freshRepos().getCreativeDirection()).toBeNull();
  });

  it("stores and returns latest text", () => {
    const repos = freshRepos();
    repos.setCreativeDirection("Lean into build-in-public");
    const stored = repos.getCreativeDirection();
    expect(stored?.text).toBe("Lean into build-in-public");
    expect(typeof stored?.updatedAt).toBe("string");
  });

  it("latest write wins", () => {
    const repos = freshRepos();
    repos.setCreativeDirection("first");
    repos.setCreativeDirection("second");
    expect(repos.getCreativeDirection()?.text).toBe("second");
  });

  it("empty text clears the direction", () => {
    const repos = freshRepos();
    repos.setCreativeDirection("something");
    repos.setCreativeDirection("   ");
    expect(repos.getCreativeDirection()).toBeNull();
  });
});
```

> Note: confirm the real exported names for schema init (`initSchema`) and repo factory (`createRepositories`) in `db.ts`/`repositories.ts`; match the test imports to them before running. If the project opens the DB differently, mirror the existing pattern used by other repo code.

- [ ] **Step 3: Run test, verify it fails.** Run: `npm test -- repositories` — Expected: FAIL (`getCreativeDirection is not a function`).

- [ ] **Step 4: Implement repo methods** in `src/server/repositories.ts`, following the existing prepared-statement pattern:

```ts
getCreativeDirection(): { text: string; updatedAt: string } | null {
  const row = db
    .prepare("SELECT text, updated_at as updatedAt FROM creative_direction ORDER BY id DESC LIMIT 1")
    .get() as { text: string; updatedAt: string } | undefined;
  return row ?? null;
},
setCreativeDirection(text: string): { text: string; updatedAt: string } | null {
  const trimmed = text.trim();
  const updatedAt = new Date().toISOString();
  if (!trimmed) {
    db.prepare("DELETE FROM creative_direction").run();
    return null;
  }
  db.prepare("DELETE FROM creative_direction").run();
  db.prepare("INSERT INTO creative_direction (text, updated_at) VALUES (?, ?)").run(trimmed, updatedAt);
  return { text: trimmed, updatedAt };
},
```

> Latest-wins via delete-then-insert keeps reads single-row and avoids history. `ponytail: single-row table, fine for one local user.`

- [ ] **Step 5: Run test, verify pass.** Run: `npm test -- repositories` — Expected: PASS (4 tests).

- [ ] **Step 6: Commit.**

```bash
git add src/server/db.ts src/server/repositories.ts src/server/repositories.test.ts
git commit -m "feat: persist creative direction note

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Direction injected into runner prompts

**Files:**
- Modify: `src/server/generation/generation-runner.ts`, `src/server/generation/codex-generation-runner.ts`
- Modify: `src/server/strategy/strategy-intelligence-runner.ts`, `src/server/strategy/codex-strategy-intelligence-runner.ts`
- Test: `src/server/generation/codex-generation-runner.test.ts` (create)

**Interfaces:**
- Consumes: nothing from Task 1 directly (route wires it in Task 3).
- Produces: runner methods accept optional `direction?: string | null`; `writeGenerationJobFiles(jobDir, { snapshot, analysis, mode, direction })` includes a direction line in `prompt.md` and `input.json` when non-empty.

- [ ] **Step 1: Write the failing test.** Create `src/server/generation/codex-generation-runner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeGenerationJobFiles } from "./codex-generation-runner";

const snapshot = { profile: { handle: "x" }, posts: [] } as any;
const analysis = { strategy_report: {}, post_analyses: [] } as any;

it("adds direction block to prompt when set", () => {
  const dir = mkdtempSync(join(tmpdir(), "gen-"));
  writeGenerationJobFiles(dir, { snapshot, analysis, mode: "today", direction: "Move away from crypto" });
  const prompt = readFileSync(join(dir, "prompt.md"), "utf8");
  expect(prompt).toContain("Move away from crypto");
  expect(prompt.toLowerCase()).toContain("creative direction");
});

it("omits direction block when null", () => {
  const dir = mkdtempSync(join(tmpdir(), "gen-"));
  writeGenerationJobFiles(dir, { snapshot, analysis, mode: "today", direction: null });
  const prompt = readFileSync(join(dir, "prompt.md"), "utf8");
  expect(prompt.toLowerCase()).not.toContain("creative direction");
});
```

- [ ] **Step 2: Run test, verify fail.** Run: `npm test -- codex-generation-runner` — Expected: FAIL (type error / missing block).

- [ ] **Step 3: Thread direction in `codex-generation-runner.ts`.** Change `writeGenerationJobFiles` input type to include `direction?: string | null`. Add the direction to `input` (so it lands in `input.json`) and insert a prompt line. Build the prompt array conditionally:

```ts
export function writeGenerationJobFiles(
  jobDir: string,
  input: { snapshot: unknown; analysis: unknown; mode: "today"; direction?: string | null }
) {
  // ...existing setup...
  const direction = typeof input.direction === "string" ? input.direction.trim() : "";
  const inputJson = JSON.stringify(input, null, 2);
  const promptLines = [
    "You are Casey McDougal's direct X/Twitter post strategist.",
    "Generate today's ideas as copy-ready X posts based on the latest public-metric audit.",
    "Use the provided strategy audit, top patterns, weak spots, and captured posts as evidence.",
    "Do not summarize the audit. Produce new posts Casey can copy into X.",
    "Avoid generic creator advice, broad motivational posts, and placeholder claims.",
    "Each draft should have a specific angle, a strong hook, and a clear reason tied to the audit.",
    ...(direction ? [`Casey's current creative direction (follow it): ${direction}`] : []),
    "Return JSON only. Do not include markdown.",
    "",
    "Input JSON:",
    inputJson
  ];
  writeFileSync(promptPath, promptLines.join("\n"));
  // ...rest unchanged...
}
```

Update `generateToday` in the same file and the `GenerationRunner` interface (`generation-runner.ts`) to accept `direction?: string | null` and pass it into `writeGenerationJobFiles`.

- [ ] **Step 4: Thread direction in strategy runner.** In `codex-strategy-intelligence-runner.ts`, the shared `writeJobFiles(jobDir, input, promptLines, schema)` already spreads `promptLines`. Add `direction?: string | null` to `generateMemoryProposal`/`exploreTopics` inputs (both runner interface in `strategy-intelligence-runner.ts` and impl). Add direction to the `input` object passed to `writeStrategyMemoryJobFiles`/`writeTopicExplorerJobFiles`, and append a conditional line to each `promptLines` array:

```ts
...(direction?.trim() ? [`Casey's current creative direction (follow it): ${direction.trim()}`] : []),
```

- [ ] **Step 5: Run test, verify pass.** Run: `npm test -- codex-generation-runner` — Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck.** Run: `npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 7: Commit.**

```bash
git add src/server/generation src/server/strategy
git commit -m "feat: inject creative direction into AI run prompts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Direction API + dashboard bootstrap + client

**Files:**
- Modify: `src/server/routes.ts`
- Modify: `src/client/api.ts`

**Interfaces:**
- Consumes: `repos.getCreativeDirection/setCreativeDirection` (Task 1), runner `direction` param (Task 2).
- Produces: `GET/POST /api/direction`; `direction` field on the `/api/dashboard` payload and `DashboardState`; client `saveCreativeDirection(text): Promise<{ text; updatedAt } | null>`.

- [ ] **Step 1: Add routes** in `src/server/routes.ts`:

```ts
app.get("/api/direction", (_request, response) => {
  response.json({ ok: true, direction: repos.getCreativeDirection() });
});

app.post("/api/direction", (request, response) => {
  const text = typeof request.body?.text === "string" ? request.body.text : "";
  response.json({ ok: true, direction: repos.setCreativeDirection(text) });
});
```

- [ ] **Step 2: Add direction to `/api/dashboard`.** In the `GET /api/dashboard` handler, include `direction: repos.getCreativeDirection()` in the JSON response object alongside snapshot/history/etc.

- [ ] **Step 3: Thread direction into the three run routes.** In `POST /api/generate/today`, `POST /api/strategy-memory/refresh`, `POST /api/topics/explore`, read `const direction = repos.getCreativeDirection()?.text ?? null;` and pass `direction` into the runner call (`generationRunner.generateToday({ ..., direction })`, etc.).

- [ ] **Step 4: Update client `DashboardState` + api** in `src/client/api.ts`: add `direction: { text: string; updatedAt: string } | null` to the `DashboardState` type and to the dashboard parse. Add:

```ts
export async function saveCreativeDirection(text: string): Promise<{ text: string; updatedAt: string } | null> {
  const response = await fetch("/api/direction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  if (!response.ok) throw new Error("Failed to save direction");
  const data = await response.json();
  return data.direction ?? null;
}
```

- [ ] **Step 5: Typecheck + existing tests.** Run: `npx tsc --noEmit && npm test` — Expected: green.

- [ ] **Step 6: Commit.**

```bash
git add src/server/routes.ts src/client/api.ts
git commit -m "feat: creative direction API + dashboard bootstrap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Spacing scale + sweep (CSS)

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add scale tokens** to `:root` (after the radius tokens, ~L41):

```css
  --space-1: 4px;  --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
  --space-5: 24px; --space-6: 32px;  --space-7: 48px;  --space-8: 64px;
```

- [ ] **Step 2: Sweep panel + grid spacing.** Replace ad-hoc padding/gap/margin values in these selectors with the nearest scale token so values are consistent: `.panel`, `.command-center-panel`, `.command-center-grid`, `.command-center-card`, `.dashboard-grid`, `.operations-grid`, `.scorecard-dimensions`, `.capture-bar`, `.evidence-details-panel`, `.strategy-engine-section`, `.signal-panel`. Standardize: panel inner padding `var(--space-5)`; grid `gap: var(--space-4)`; eyebrow->title gap `var(--space-2)`; the workspace adjacency margin to `var(--space-5)`. Keep visual intent; only normalize the numbers.

- [ ] **Step 3: Visual check.** Run `npm run dev`, open the app, confirm panels/cards align and gaps look even at a normal desktop width (~1280px) and a narrow width (~900px). Note any leftover misalignment and fix.

- [ ] **Step 4: Commit.**

```bash
git add src/styles.css
git commit -m "style: spacing scale tokens + panel/grid sweep

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Motion layer (CSS)

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add motion tokens** to `:root`:

```css
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 140ms; --dur-base: 220ms; --dur-slow: 380ms;
```

- [ ] **Step 2: Add keyframes + entrance.** Add a `rise-in` keyframe (translateY(10px)+opacity 0 -> 0/1) and a `pop` keyframe (scale 0.8 -> 1.05 -> 1). Apply staggered entrance to card groups:

```css
@keyframes rise-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes pop { 0% { transform: scale(0.8); } 60% { transform: scale(1.06); } 100% { transform: scale(1); } }

.command-center-card, .opportunity-card, .scorecard-dimensions > article {
  animation: rise-in var(--dur-base) var(--ease-spring) both;
}
.command-center-grid > :nth-child(2) { animation-delay: 40ms; }
.command-center-grid > :nth-child(3) { animation-delay: 80ms; }
.command-center-grid > :nth-child(4) { animation-delay: 120ms; }
```

(Adjust selector list to the real card class names found in the markup.)

- [ ] **Step 3: Button + success + expand feedback.**

```css
.primary-button:active, .secondary-button:active { transform: scale(0.97); }
.copy-button.is-copied svg, .direction-save.is-saved svg { animation: pop var(--dur-base) var(--ease-spring); }
details[open] > *:not(summary) { animation: rise-in var(--dur-base) var(--ease-out) both; }
```

Confirm meter fills use `transition: width var(--dur-base) var(--ease-out)`.

- [ ] **Step 4: Extend reduced-motion block** (~L4181) to neutralize the new motion:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

(Merge with whatever the existing block already does; do not remove existing rules.)

- [ ] **Step 5: Visual check.** `npm run dev`: panels rise+stagger on load, buttons depress, copy/save pops. Toggle OS reduce-motion (or emulate in devtools) and confirm everything is static.

- [ ] **Step 6: Commit.**

```bash
git add src/styles.css
git commit -m "style: expressive motion layer + reduced-motion guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Flatten information architecture

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css` (styles for the now-inline blocks)
- Check: `src/App.test.tsx` (update any selectors that referenced removed wrappers)

- [ ] **Step 1: Un-nest command-center disclosures.** In `AuditCommandCenter` (`App.tsx`), replace the `command-center-signal-disclosure` `<details>` and the `scorecard-breakdown` `<details>` with plain inline containers (`<div className="command-center-signals">` and the dimensions grid). Remove the `<summary>` rows. Keep the copy-scorecard button inline. The three command signals and dimension meters now always show.

- [ ] **Step 2: Promote Evidence details.** In `App.tsx`, change the `<details className="evidence-details-panel">` to a `<section className="panel evidence-panel">` with a normal header (eyebrow/title). Render `ScanHistoryPanel`, the signal panel, and `ActionProgressPanel` as inline siblings in `.operations-grid`. Remove the outer `<details>`/`<summary>`.

- [ ] **Step 3: Collapse Run log to one layer.** `ActionProgressPanel` currently is its own `<details>`. Keep it as a `<details>` ONLY here (it is now a leaf inside the inline evidence panel, so total depth from the page = 1). Preserve the `shouldOpen` auto-expand-on-activity behavior. This is acceptable: evidence panel is inline, run log is the single disclosure within it.

> Decision: the one tolerated disclosure on the main path is the Run log (auto-opens on activity). The Strategy engine remains the one tolerated disclosure for advanced tools. Both are single-layer (not nested in another `<details>`). That satisfies "max one disclosure layer anywhere."

- [ ] **Step 4: Fix selectors.** `handleStrategyEngineTabChange` queries `.strategy-engine-tabs` — unaffected. Verify `handleReviewDraftQueue` target still resolves. Grep `App.tsx` for `evidence-details-panel`, `command-center-signal-disclosure`, `scorecard-breakdown` and remove dead references.

- [ ] **Step 5: Update styles.** Move the relevant CSS from the `<details>`/`summary` selectors to the new inline `.command-center-signals`, `.evidence-panel`, and dimension grid selectors. Remove now-dead `summary::after` toggle styles for the un-nested blocks.

- [ ] **Step 6: Run tests.** Run: `npm test` — Expected: green. If `App.test.tsx` asserted on a removed `<summary>`/disclosure, update it to assert the content now renders inline.

- [ ] **Step 7: Visual check.** `npm run dev`: command signals + score breakdown visible without clicking; evidence is an inline panel; only Run log (on activity) and Strategy engine remain collapsible.

- [ ] **Step 8: Commit.**

```bash
git add src/App.tsx src/styles.css src/App.test.tsx
git commit -m "refactor: flatten cockpit IA to one disclosure layer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Creative Direction UI

**Files:**
- Create: `src/client/components/CreativeDirectionCard.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `saveCreativeDirection` + `direction` from `DashboardState` (Task 3).

- [ ] **Step 1: Build the card component.** Create `src/client/components/CreativeDirectionCard.tsx`:

```tsx
import { Check, Compass } from "lucide-react";
import { useState } from "react";

export function CreativeDirectionCard({
  initial,
  onSave
}: {
  initial: { text: string; updatedAt: string } | null;
  onSave: (text: string) => Promise<{ text: string; updatedAt: string } | null>;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [updatedAt, setUpdatedAt] = useState(initial?.updatedAt ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await onSave(text);
      setUpdatedAt(result?.updatedAt ?? null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel direction-card" aria-label="Creative direction">
      <div className="direction-head">
        <p className="eyebrow"><Compass size={14} aria-hidden="true" /> Creative direction</p>
        <h2>Steer what gets generated</h2>
        <p>Plain-language guidance fed into every idea, topic, and memory run.</p>
      </div>
      <textarea
        className="direction-input"
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder="e.g. Move away from crypto takes. Lean into build-in-public and tools."
        rows={3}
        aria-label="Creative direction text"
      />
      <div className="direction-foot">
        <span aria-live="polite">{updatedAt ? `Updated ${relativeTime(updatedAt)}` : "Not set"}</span>
        <button
          className={saved ? "primary-button direction-save is-saved" : "primary-button direction-save"}
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          aria-busy={saving || undefined}
        >
          <Check size={16} aria-hidden="true" /> {saving ? "Saving" : saved ? "Saved" : "Save direction"}
        </button>
      </div>
    </section>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
```

- [ ] **Step 2: Wire into `App.tsx`.** Add state: `const [direction, setDirection] = useState(() => bootstrappedDashboard?.direction ?? null);`. Pull `dashboard.direction` in `refresh()`. Render `<CreativeDirectionCard initial={direction} onSave={async (t) => { const d = await saveCreativeDirection(t); setDirection(d); return d; }} />` directly under `<AuditCommandCenter>`. Lazy-load is optional; direct import is fine (small).

- [ ] **Step 3: Direction chip near Generate.** In `AuditCommandCenter` (or beside the generate buttons), when `direction` text exists, render a compact chip: `<span className="direction-chip" title={direction.text}>Steering: {truncate(direction.text, 40)}</span>`. Pass `direction` down as a prop.

- [ ] **Step 4: Styles.** Add `.direction-card`, `.direction-input` (textarea: dark field, `--line` border, `--radius-sm`, `var(--space-3)` padding, focus ring `--focus`), `.direction-foot` (flex space-between, `var(--space-3)` gap), `.direction-chip` (pill, `--accent-soft` bg, `--accent` text). Reuse existing button styles.

- [ ] **Step 5: Typecheck + tests.** Run: `npx tsc --noEmit && npm test` — Expected: green.

- [ ] **Step 6: Manual flow check.** `npm run dev`: type a direction, Save (check-pop), reload page → text persists (bootstrapped). Chip shows near Generate.

- [ ] **Step 7: Commit.**

```bash
git add src/client/components/CreativeDirectionCard.tsx src/App.tsx src/styles.css
git commit -m "feat: creative direction steering card + chip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Final professional audit

**Files:** read-only review + targeted fixes across changed files.

- [ ] **Step 1: Full gate.** Run: `npx tsc --noEmit && npm test && npm run lint` — Expected: all green. Fix anything red.

- [ ] **Step 2: Spacing audit.** Open app; verify every panel/card aligns to the scale, headers line up across panels, no orphan margins at 1280px and 900px widths. Fix stragglers.

- [ ] **Step 3: Motion audit.** Confirm consistent easing/durations, entrances stagger without jank, copy/save pop fires, meters animate. Emulate `prefers-reduced-motion: reduce` → confirm fully static. Fix inconsistencies.

- [ ] **Step 4: A11y audit.** Tab through: direction textarea + save, all flattened buttons, strategy tabs — visible focus rings, correct `aria-live` on save/run feedback, contrast holds on dark theme. Fix gaps.

- [ ] **Step 5: Steering end-to-end.** Set a direction, trigger a generate run, inspect the latest generation `jobDir` `input.json` + `prompt.md` to confirm the direction text is present; clear the direction, run again, confirm the block is absent.

- [ ] **Step 6: Write audit report** to `docs/superpowers/audits/2026-06-29-cockpit-refinement-audit.md` summarizing findings, fixes, and any deferred items. Commit.

```bash
git add -A
git commit -m "docs: cockpit refinement audit report

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** Spacing (T4), motion (T5), flatten IA (T6), steering persistence/API/injection/UI (T1-T3, T7), final audit (T8). All spec sections mapped.
- **Type consistency:** `getCreativeDirection`/`setCreativeDirection` return `{ text; updatedAt } | null` consistently across repo (T1), routes/client (T3), card (T7). Runner `direction?: string | null` consistent across T2/T3.
- **Placeholders:** none; each code step shows real code. CSS sweep (T4) is mechanical-by-selector with concrete targets.
- **Note for implementer:** confirm exact exported names in `db.ts`/`repositories.ts` (schema init + repo factory) before wiring Task 1 test imports; mirror existing patterns if they differ.
