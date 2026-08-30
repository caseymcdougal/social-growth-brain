# Beginner Phase-Gating Design

Date: 2026-07-02
Owner: Casey McDougal
Status: Implemented

## Goal

Make the Social Audit dashboard beginner-friendly: one obvious action per visit, progressive disclosure as the user completes scan → audit → draft, and clearer ties between AI outputs and X growth.

## Phase model

`getWorkflowPhase()` in `src/shared/workflow-phase.ts`:

| Phase | Condition | Primary UI |
|---|---|---|
| `empty` | No snapshot | `NextMoveHero` — **Scan my posts** only; paste as text link |
| `scanned` | Snapshot, no analysis | `NextMoveHero` — **Find what's working** + preview line |
| `audited` | Analysis, no generation | `NextMoveHero` + coach grid + post lab; reference shelf collapsed |
| `drafted` | Generation exists | `AuditCommandCenter` handoff + draft queue; coach/opportunities in reference |

## Changes

- **`NextMoveHero`** replaces duplicate `CaptureBar` + command center for non-draft phases.
- **Creative direction** moved inside **Go deeper** (strategy engine).
- **Opportunity desk** renamed to plain language; always in reference shelf as collapsed disclosure.
- **Drafts** show `Based on: {source_signal}` on production slots and draft library cards.
- **Reference shelf** hidden until `audited` or `drafted`.

## Success criteria

- Fresh visit: one primary button within 5 seconds.
- Audited state: one enabled **Write draft ideas** command.
- Drafted state: drafts front and center; no duplicate next-move hero.