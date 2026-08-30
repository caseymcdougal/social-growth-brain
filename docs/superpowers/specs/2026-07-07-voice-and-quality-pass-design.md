# Voice Profile + Quality Pass — Design

Date: 2026-07-07. Approved by Casey (voice = derived profile, features = judgment pass).

## Goals

1. Generation and rewrites sound like Casey, not generic AI commentary.
2. The audit stops presenting failures as wins.
3. The UI stops clipping, misaligning, and repeating itself.

## 1. Voice profile engine

**Derivation.** New LLM job (`src/server/voice/voice-profile-runner.ts`, same
`runLlmJob` pattern as generation). Input: all captured posts of the latest
snapshot + bio. Output (zod schema in `src/shared/voice-profile.ts`):

- `summary` — one-paragraph read of the voice
- `casing_and_punctuation` — observed habits (lowercase leaning, quote style…)
- `sentence_rhythm` — length/structure habits
- `vocabulary` — recurring words/phrases that are his
- `hook_moves` — opening moves he actually uses
- `banned_moves` — things that would read as not-Casey (title case, hashtags,
  motivational filler, generic AI cadence)
- `style_excerpts` — 2–3 short verbatim excerpts tagged STYLE REFERENCE ONLY

**Storage.** `voice_profiles` table (id, profile_snapshot_id, created_at,
job_dir, profile_json). Manual edits live separately in single-row
`voice_overrides` (text, updated_at) so refreshes never clobber them.

**Refresh.** Auto after successful `/api/capture` and `/api/import`
(fire-and-forget background job; failures logged, never block capture).
Manual via `POST /api/voice/refresh`. Read via `GET /api/voice/latest`.
Overrides saved via `PUT /api/voice/overrides`.

**Injection.** Generation prompt and audit prompt both get a "Casey's voice
profile — follow exactly; overrides win over derived rules" section when a
profile exists (derived card + overrides). Audit `rewrite`/`variant_hooks`
must be written in this voice. No profile → prompts unchanged.

**UI.** "Voice" tab added to the strategy-tools tab strip. Shows the derived
card (read-only), an overrides textarea (save button), refresh button with
busy state, and the derived-at date.

## 2. Audit semantics fix

Prompt (`codex-cli-runner.ts`) gains explicit field semantics: `top_patterns`
and `what_is_working` contain only repeatable positive mechanisms (if nothing
worked, name the closest-to-working mechanism — never a failure statement);
failures go in `what_is_holding_back`.

UI hardening regardless of model behavior:

- `CoachReport` "What's working" card reads `what_is_working[0]`; the weekly
  lesson uses a genuine win, else falls back to the main risk framed honestly
  ("biggest thing holding you back").
- `experiment-ledger` builds "Repeat:" watches from `what_is_working` (not
  `top_patterns`) and labels trend as account-level.
- `StrategyMemoryPanel` disables "Apply memory updates" until a proposal
  exists.

## 3. UI consistency sweep

- Clipped text gets real ellipsis or wraps: hero quad cards, data-quality
  "your top post" (mid-word cut), any line-clamped copy.
- Trendline stat tiles: current value big, delta as small signed chip;
  same-day scan comparison labeled by time, not identical dates.
- Ranked-post grid: analysis interiors aligned, "Copy rewrite" pinned to card
  bottom, no dangling voids from uneven pairs.
- Draft card shows the hook once (drop the duplicated bold line when the
  draft starts with the same sentence; posting brief references, not repeats).
- "Your next moves" cards share one header layout (icon slot alignment).
- `styles.css` token sweep: replace 10 `rgba(255,…)` with the cool
  white-point per DESIGN.md; snap off-scale paddings (5/7/11/14px) to the
  4px scale where visually safe.
- Verify the Memory-tab layout collapse seen during audit (possibly a
  browser-contention artifact) and phone-width layout.

## 4. Sequencing

Three commits on `redesign/tomo-dark`: (1) voice engine, (2) audit semantics,
(3) UI sweep. Tests green at each step; dist rebuilt + API LaunchAgent
kicked at the end (start:api has no watch).

## Out of scope

Per-experiment signal tracking (ledger keeps global trend, labeled honestly),
n-gram novelty gate (only if the prompt-level anti-dup keeps failing),
new features beyond the above.
