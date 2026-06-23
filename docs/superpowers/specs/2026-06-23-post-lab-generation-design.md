# Post Lab Generation UX Design

Date: 2026-06-23
Owner: Casey McDougal
Status: Approved direction

## Goal

Make the dashboard's payoff obvious after a strategy audit: Casey should see a clear next action to generate usable posts, not have to infer that drafts are a side effect of running the audit.

## Product Decision

Keep audit and generation separate.

The audit diagnoses recent public X performance. Post generation uses that diagnosis to create new drafts. Once an audit exists, the primary action should shift from `Run strategy audit` to `Generate today's ideas`. `Re-run audit` remains available as a secondary action.

## Core Flow

1. Casey scans public X metrics.
2. Casey runs the strategy audit.
3. The app unlocks `Post Lab`.
4. Casey clicks `Generate today's ideas`.
5. The backend runs a new Codex CLI generation job using the latest snapshot plus latest audit.
6. The UI shows generated topics/posts as working drafts with copy actions.

## Post Lab Actions

V1 of this pass should implement one primary generation action:

- `Generate today's ideas`

The UI should also reserve clear secondary action slots for:

- `Posts like top performer`
- `Rewrite selected post`
- `Contrarian angles`

For this pass, those secondary actions should be visible but disabled with concise labels such as `Needs selected post` or `After today's ideas`. The implemented generation mode is `Generate today's ideas`.

## Backend

Add a generation route separate from analysis:

- `POST /api/generate/today`

Inputs:

- latest captured snapshot
- latest successful analysis for that snapshot

Output:

- structured generated post recommendations

Store generated drafts locally so refresh does not erase them.

Suggested database table:

- `generation_runs`
  - `id`
  - `profile_snapshot_id`
  - `analysis_run_id`
  - `status`
  - `mode`
  - `started_at`
  - `finished_at`
  - `error_stage`
  - `error_message`
  - `job_dir`
- `generated_posts`
  - `id`
  - `generation_run_id`
  - `title`
  - `angle`
  - `why_this`
  - `hook`
  - `draft`
  - `source_signal`

Use the same `codex exec` pattern as analysis, but with a narrower prompt:

- generate copy-ready posts for today
- ground the ideas in the latest audit and top/weak post patterns
- avoid generic creator advice
- return JSON only

## Frontend

Replace the passive `Idea Studio` panel with `Post Lab`.

States:

- No scan: disabled, tells Casey to scan first.
- Scan but no audit: disabled, tells Casey to run audit first.
- Audit available, no generation: primary `Generate today's ideas`.
- Generating: visible busy state with specific copy.
- Generated: list drafts with copy actions and source rationale.
- Error: recoverable message and retry button.

The main capture/action area should make the next step obvious:

- Before scan: `Scan public metrics` is primary.
- After scan, before audit: `Run strategy audit` is primary.
- After audit: `Generate today's ideas` is primary; `Re-run audit` is secondary.

## UX Requirements

- Do not add scheduling.
- Do not post to X.
- Keep the workflow local/private.
- Make generated drafts copy-ready for manual use in X.
- Preserve metric coverage and ranked post review from the previous pass.
- Do not hide generation inside the audit action.

## Testing

Add tests for:

- generation schema validation
- generation route requiring an audit first
- generation route returning/storing drafts with an injected runner
- frontend shell showing `Generate today's ideas` after an audit exists

Run:

- `npm test`
- `npm run build`
