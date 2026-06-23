# Strategy Memory and Topic Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local strategy memory and adjacent-topic explorer so the dashboard improves Casey's retained context and helps find nearby content lanes.

**Architecture:** Keep the current Vite React, Express, SQLite, Zod, and hidden Codex CLI architecture. Add shared strategy-intelligence schemas, a Codex-backed runner boundary, SQLite persistence for accepted memory/proposals/topics, API routes, and two new React panels.

**Tech Stack:** Vite, React, TypeScript, Express, better-sqlite3, Zod, Vitest, Testing Library, lucide-react, Codex CLI.

---

## File Structure

- Create `src/shared/strategy-intelligence-schema.ts` for accepted memory, memory proposal, and topic exploration schemas.
- Create `src/server/strategy/strategy-intelligence-runner.ts` for the runner interface.
- Create `src/server/strategy/codex-strategy-intelligence-runner.ts` for Codex CLI prompt/schema jobs.
- Modify `src/server/db.ts` with strategy memory/proposal/topic run tables.
- Modify `src/server/repositories.ts` to save/load memory, proposals, and topic runs.
- Modify `src/server/routes.ts` to expose strategy memory and topic endpoints.
- Modify `src/client/api.ts` for new API helpers.
- Create `src/client/components/StrategyMemoryPanel.tsx`.
- Create `src/client/components/TopicExplorer.tsx`.
- Modify `src/App.tsx` and `src/styles.css` to add the intelligence area.
- Add `tests/shared/strategy-intelligence-schema.test.ts`.
- Add `tests/server/codex-strategy-intelligence-runner.test.ts`.
- Extend `tests/server/routes.test.ts` and `src/App.test.tsx`.

## Tasks

- [x] **Task 1: Add shared schemas**
  - Write failing tests for valid strategy memory, memory proposal output, valid topic exploration, and whitespace rejection.
  - Implement `strategyMemorySchema`, `strategyMemoryProposalOutputSchema`, and `topicExplorationOutputSchema`.
  - Verify with `npm test -- tests/shared/strategy-intelligence-schema.test.ts`.

- [x] **Task 2: Add strategy intelligence runner**
  - Write failing tests for Codex args and job-file creation for memory/topic jobs.
  - Implement `StrategyIntelligenceRunner` and `CodexStrategyIntelligenceRunner`.
  - Verify with `npm test -- tests/server/codex-strategy-intelligence-runner.test.ts`.

- [x] **Task 3: Add persistence and routes**
  - Write failing route tests for audit requirements, memory proposal generation, applying a proposal, and topic exploration.
  - Add tables and repository methods.
  - Add route injection for `strategyRunner`.
  - Verify with `npm test -- tests/server/routes.test.ts`.

- [x] **Task 4: Add client intelligence workflow**
  - Write failing app test showing `Update strategy memory` and `Explore nearby topics` after audit is loaded.
  - Add API helpers and App state/handlers.
  - Add `StrategyMemoryPanel` and `TopicExplorer`.
  - Verify with `npm test -- src/App.test.tsx`.

- [x] **Task 5: Polish and verify**
  - Apply Open Design xAI/dashboard guidance to keep the UI dense, sharp, and non-generic.
  - Run `npm test`.
  - Run `npm run build`.
  - Smoke check in Chrome with `browser-harness`.
  - Commit the implementation.

  Status: `npm test`, `npm run build`, API smoke checks, and `git diff --check` passed. Browser-harness smoke was attempted but blocked by Chrome's remote-debugging permission prompt.
