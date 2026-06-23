# Post Lab Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate Post Lab generation workflow so the dashboard clearly moves from audit diagnosis to copy-ready post ideas.

**Architecture:** Keep the existing local Vite/React + Express + SQLite architecture. Add a `GenerationRunner` boundary next to the existing AI runner, persist generated drafts in SQLite, expose latest/generate endpoints, and replace the passive Idea Studio with an active Post Lab command surface.

**Tech Stack:** Vite, React, TypeScript, Express, better-sqlite3, Zod, Vitest, Testing Library, lucide-react, Codex CLI.

---

## File Structure

- Create `src/shared/generation-schema.ts` for generated post validation and types.
- Create `src/server/generation/generation-runner.ts` for the generation runner interface.
- Create `src/server/generation/codex-generation-runner.ts` for the Codex CLI generation job and prompt files.
- Modify `src/server/db.ts` to add `generation_runs` and `generated_posts`.
- Modify `src/server/repositories.ts` to save and load generated posts for the latest snapshot/audit.
- Modify `src/server/routes.ts` to expose `GET /api/generation/latest` and `POST /api/generate/today`.
- Modify `src/client/api.ts` to call the generation endpoints.
- Replace `src/client/components/NextPostQueue.tsx` with an active Post Lab component while preserving the export name to limit imports.
- Modify `src/App.tsx`, `src/styles.css`, and `src/App.test.tsx` for the new action hierarchy.
- Add `tests/shared/generation-schema.test.ts`, `tests/server/codex-generation-runner.test.ts`, and route tests.

## Tasks

- [x] **Task 1: Add generation schema**
  - Write failing schema tests covering valid drafts and empty text rejection.
  - Implement `generatedPostSchema` and `generationOutputSchema`.
  - Verify with `npm test -- tests/shared/generation-schema.test.ts`.

- [x] **Task 2: Add generation runner**
  - Write failing tests for generation job file creation and Codex args.
  - Implement the runner interface and Codex generation job helper.
  - Verify with `npm test -- tests/server/codex-generation-runner.test.ts`.

- [x] **Task 3: Add persistence and routes**
  - Write failing route tests for requiring an audit first, generating drafts with an injected runner, and loading latest generation.
  - Add database tables and repository methods.
  - Add `generationRunner` injection to `createServerApp`.
  - Verify with `npm test -- tests/server/routes.test.ts`.

- [x] **Task 4: Add client Post Lab flow**
  - Write failing app test showing `Generate today's ideas` after an audit is present.
  - Add client API helpers and App state.
  - Replace passive Idea Studio with active Post Lab states and copy actions.
  - Verify with `npm test -- src/App.test.tsx`.

- [x] **Task 5: Polish and verify**
  - Update CSS so the primary CTA shifts clearly after audit.
  - Run `npm test`.
  - Run `npm run build`.
  - Use browser-harness to smoke check the local app.
  - Commit the implementation.
