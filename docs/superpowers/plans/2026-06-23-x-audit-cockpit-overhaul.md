# X Audit Cockpit Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the local X social audit dashboard into a public-metric creator strategy cockpit with ranked post review, durable latest audit display, and copy-ready recommendations.

**Architecture:** Keep the existing Vite React, Express, SQLite, browser-harness, and Codex CLI architecture. Add small shared performance utilities, improve capture parsing in the browser adapter, add a latest-analysis repository/API path, and redesign the React surface around capture quality, ranked posts, diagnosis, and idea drafts.

**Tech Stack:** Vite, React, TypeScript, Express, better-sqlite3, Zod, Vitest, Testing Library, lucide-react, browser-harness, Codex CLI.

---

## File Structure

- Modify `src/server/capture/browser-harness-x.ts` for public metric extraction.
- Modify `src/server/repositories.ts` to reconstruct the latest successful analysis for the latest snapshot.
- Modify `src/server/routes.ts` to add `GET /api/analysis/latest`.
- Modify `src/client/api.ts` for the new route.
- Add `src/shared/performance.ts` for metric completeness, scoring, and ranking.
- Modify `src/App.tsx` and component files under `src/client/components/` for the cockpit UI.
- Rewrite `src/styles.css` to use the sharper strategy-room visual system.
- Add tests under `tests/shared/performance.test.ts` and extend `tests/server/routes.test.ts`.
- Update `src/App.test.tsx` to match the new shell.

## Tasks

- [ ] Add shared performance utilities and tests.
- [ ] Add latest-analysis repository and API support with route tests.
- [ ] Improve browser capture metric extraction while preserving browser-harness flow.
- [ ] Redesign the dashboard components around capture quality, ranked posts, diagnosis, and idea studio.
- [ ] Replace the generic styling with a polished dark strategy cockpit.
- [ ] Run `npm test` and `npm run build`; fix failures.

