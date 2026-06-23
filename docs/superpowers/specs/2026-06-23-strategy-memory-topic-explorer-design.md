# Strategy Memory and Topic Explorer Design

Date: 2026-06-23
Owner: Casey McDougal
Status: Approved by build instruction

## Goal

Turn the dashboard from a one-off audit/post generator into a local strategy engine that remembers Casey's content context, proposes improvements to that context, and explores adjacent topics grounded in his own X performance.

## Scope

In scope:

- Maintain a local accepted strategy memory.
- Generate proposed memory updates from the latest capture and audit.
- Require Casey to apply proposed memory updates before they become accepted context.
- Explore adjacent topics near Casey's strongest lanes using latest audit, captured posts, and accepted memory when present.
- Show evidence for why a topic or memory update is near Casey's lane.
- Keep all work local through the existing Express, SQLite, and hidden Codex CLI architecture.

Out of scope:

- Automatic posting, scheduling, or X API access.
- Silent memory mutation.
- Long-term competitor/research scraping.
- Multi-account/client workspace features.

## Product Model

The dashboard should have three distinct layers:

1. **Audit**: what happened in recent public posts.
2. **Strategy Memory**: what the app currently believes about Casey's content lane, voice, audience, and experiments.
3. **Topic Explorer**: where Casey can go next without drifting away from his lane.

The key rule is that strategy memory is proposed before it is accepted. The engine can say "I think this is now true about your lane," but Casey has to apply it.

## Strategy Memory

Accepted memory should include:

- positioning
- audience segments
- strongest content lanes
- weak or overused lanes
- voice rules
- proof points from observed posts
- active experiments

Proposals should include:

- area being changed
- proposed update
- reason
- evidence from posts/audit

The UI should show:

- current accepted memory, if any
- pending proposed updates, if any
- `Update strategy memory` action after audit
- `Apply memory updates` action only when a proposal exists

## Topic Explorer

Topic cards should include:

- topic title
- lane it connects to
- why it is near Casey's existing lane
- evidence from recent posts/audit/memory
- risk level
- hooks
- copy-ready draft
- follow-up prompt for deeper exploration

The first implemented mode is `Explore nearby topics`. Future modes can add sharper takes, audience pain, contrarian maps, and thread seeds.

## Backend

Add a `StrategyIntelligenceRunner` boundary with two operations:

- `generateMemoryProposal`
- `exploreTopics`

Add routes:

- `GET /api/strategy-memory/latest`
- `POST /api/strategy-memory/refresh`
- `POST /api/strategy-memory/apply`
- `GET /api/topics/latest`
- `POST /api/topics/explore`

Persist:

- accepted memory snapshots
- pending/applied memory proposals
- topic exploration runs

## Frontend

Add a new intelligence area between the audit/Post Lab panels and the ranked review:

- `Strategy Memory` panel
- `Topic Explorer` panel

The panels should be locked before audit, active after audit, and visibly tied to accepted memory/proposals.

## Testing

Add tests for:

- schema validation for strategy memory and topic exploration
- route behavior requiring audit before memory/topic generation
- route behavior for proposal generation and apply
- route behavior for topic exploration
- frontend visibility of `Update strategy memory` and `Explore nearby topics`

Run:

- `npm test`
- `npm run build`
