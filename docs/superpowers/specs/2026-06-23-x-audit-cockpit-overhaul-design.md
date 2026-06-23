# X Audit Cockpit Overhaul Design

Date: 2026-06-23
Owner: Casey McDougal
Status: Approved by proceed instruction

## Goal

Turn the local X social audit dashboard from a generic capture/report page into a serious creator strategy cockpit. The pass should improve public metric capture, rank posts by visible signal, explain why posts likely worked or failed, and provide copy-ready recommended posts Casey can manually move into X.

## Scope

In scope:

- Use public-visible X profile metrics only.
- Improve browser capture so reply, repost, like, bookmark, and view counts are extracted from multiple visible DOM sources when available.
- Show capture quality and missing-metric state in the UI instead of pretending every scan is complete.
- Persist and reload the latest successful audit for the latest captured snapshot.
- Rank captured posts by visible performance signal.
- Render post diagnosis with reason, hook, clarity, audience fit, recommendation, rewrite, and alternate hooks.
- Add a post idea/draft workspace that presents generated topics, rationale, hooks, and copy-ready drafts with copy actions.
- Replace the current generic dashboard styling with a dense, sharp, monochrome, X-adjacent creator cockpit using local Open Design `x-ai` and dashboard guidance.

Out of scope:

- X API, OAuth, paid model API usage, or public SaaS hosting.
- Scheduling or posting to X.
- Manual metric correction in the primary workflow.
- Heavy media capture or analytics-panel scraping.

## Design Direction

The interface should feel like a private strategy room for one creator. It should not feel like a SaaS analytics template. Use a dark, sharp, mostly monochrome system with restrained borders, compact modules, and strong type hierarchy. The main screen should answer, in order:

1. What did we capture, and how trustworthy are the public metrics?
2. Which posts won or underperformed?
3. Why did they likely perform that way?
4. What should Casey post next?

## Functional Changes

### Capture Quality

Browser capture should keep using `browser-harness` and the logged-in Chrome session. The extractor should:

- Only keep original posts from the requested handle.
- Scroll until it has up to 25 usable posts or reaches a reasonable limit.
- Read metrics from article-level aria labels, action button aria labels, visible action text, analytics links, and role-group labels.
- Return `null` when a metric is not publicly visible rather than fabricating zero.

The UI should compute completeness from the stored snapshot and show how many metric fields were captured.

### Latest Audit

The backend should expose the latest successful analysis for the latest captured profile snapshot. On app load, the UI should show the last good audit if it matches the current snapshot.

### Ranking

The UI should sort posts by a deterministic visible score. Views should count lightly. Replies, reposts, bookmarks, and likes should count more because they signal stronger intent. Missing metrics should not crash or hide a post; the UI should label missing fields.

### Diagnosis

The audit report should foreground:

- account positioning read
- executive summary
- top patterns
- working factors
- limiting factors
- ranked post-by-post diagnosis

Each post card should show the original post, public metrics, rank, visible score, AI diagnosis, recommended change, rewrite, and alternate hooks when available.

### Idea Studio

Generated recommendations should be a first-class workspace:

- Topic/title
- Why it fits the audit
- Hook
- Draft
- Copy button per draft

Casey will manually move drafts into X. No scheduling workflow is included.

## Testing

Add focused tests for:

- metric completeness and ranking utilities
- latest analysis route
- app shell rendering after the redesign

Run:

- `npm test`
- `npm run build`

