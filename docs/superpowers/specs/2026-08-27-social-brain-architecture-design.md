# Social Brain Architecture Design

Date: 2026-08-27
Owner: Casey McDougal
Status: Approved architecture, pending written-spec review

## Goal

Replace the Social Audit Dashboard with a headless, model-native X growth system that continuously finds timely opportunities, predicts which actions can perform for Casey, delivers a ready-to-publish recommendation, learns from the actual result, and exposes that intelligence through durable tool contracts rather than a dashboard.

The system will overfit to Casey during phase one. It may expand to creators in Casey's niche only after Casey's proof gate passes. It may expand outside that niche only after the niche cohort independently passes its own gate.

## Phase-One Proof

The phase-one proof gate is seven consecutive America/Chicago calendar days where:

- The system predeclares exactly one Primary Bet before it is published.
- The Primary Bet is an original post, reply, or quote recommendation generated or selected by the system.
- Casey approves and publishes the locked revision within its opportunity window.
- Casey's own post receives at least 1,000 views within 48 hours.
- No paid promotion contributes to the result.

A missing bet, late publication, or sub-1,000 result resets the streak. Other assisted posts may be published but cannot rescue the daily proof result. The final proof cannot be certified until the seventh post's 48-hour window matures.

## Product Principles

1. **Protocol first:** The durable asset is the data, event history, scoring logic, calibration, and tool contract. Skills and interfaces remain thin adapters.
2. **Evidence before confidence:** The system may abstain. It must report probability ranges, provenance, and uncertainty instead of presenting an arbitrary score as certainty.
3. **Fast filters, expensive judgment late:** Deterministic code handles the high-volume stream. Strong models see only exceptional candidates.
4. **Personal before general:** Casey-specific evidence and performance take priority over broadly applicable social-media advice.
5. **Every recommendation becomes an experiment:** Predictions, edits, delays, approvals, rejections, publication IDs, and timed outcomes remain replayable.

## Non-Goals

- Rebuilding or preserving the dashboard UI.
- Generalizing for multiple creators before Casey's proof gate passes.
- Fully autonomous publishing during phase one.
- Depending on one model provider.
- Claiming literal certainty about stochastic social performance.
- Using browser scraping or browser automation anywhere in the production system.
- Training or fine-tuning AI/ML models on X data.
- Building a custom mobile app during phase one.

## System Shape

```text
Official X API sources + Casey-nominated Post URLs
  filtered stream + recent search + counts + trends + watched accounts
                              |
                              v
                       Candidate Collector
                              |
                              v
                 Deterministic Eligibility Gate
                              |
                              v
                   Live-Potential Feature Scorer
                              |
                              v
                  Casey-Fit and Execution Judge
                              |
                              v
                    Calibrated View Forecast
                              |
                              v
                       Opportunity Ledger
                         /            \
                        v              v
                 Telegram push    MCP + skills
                         \            /
                          v          v
                        Casey approval
                              |
                              v
                    Publisher / Composer
                              |
                              v
                    Timed Outcome Snapshots
                              |
                              v
                 Calibration + Champion/Challenger
```

The Opportunity Ledger is the system of record. Telegram, Codex, Claude, phones, voice interfaces, and future ambient agents consume the same versioned Opportunity contract.

## Runtime Topology

### Cloud Core

A long-running cloud container owns:

- X stream connections and catch-up searches
- deterministic candidate processing
- model judgment and calibrated forecasting
- PostgreSQL persistence
- Telegram delivery
- approval and publication coordination
- scheduled outcome collection
- proof and learning jobs
- policy approval and content-compliance enforcement

It must remain useful when Casey's Mac, Codex, Claude, or Telegram is unavailable.

### PostgreSQL System of Record

PostgreSQL stores the immutable event ledger and current materialized Opportunity state. SQLite remains supported for local tests and replay fixtures, but it is not the production source of truth.

All storage access goes through explicit repository interfaces. Domain code must not depend directly on PostgreSQL-specific behavior unless the behavior is isolated in the production repository adapter.

### Manual Nomination Adapter

Casey may nominate a Post from his personalized feed by sharing its X URL through Telegram, Codex, or Claude. The adapter extracts only the Post ID from the URL, rehydrates the Post through the official X API, and sends the normalized result through the same eligibility and scoring pipeline as continuously sensed candidates.

Manual nomination never reads page DOM, cookies, or browser-session data. A missing, deleted, protected, or inaccessible Post fails closed with a clear reason.

## Signal Sources

The official X API is the continuous sensing foundation:

- Filtered Stream for immediate matching posts
- Recent Search for catch-up and targeted discovery
- Recent Counts for minute-level topic acceleration
- Personalized Trends when Casey's authenticated account and subscription permit it
- Watched-account timelines, lists, and mentions
- Public and owned-post metrics for outcome tracking

Casey-nominated Post URLs supplement official discovery when his personalized feed surfaces something the configured API rules missed. Manual nomination is a user-directed API lookup, not a browser capture path.

The API adapter must be replaceable. Domain inputs are normalized `SignalCandidate` values rather than raw endpoint responses.

Current X pricing is pay-per-use, including per-resource Post reads. Narrow rules, precise search, caching, deduplication, and explicit budgets are required architecture, not optional optimization. The service must refuse production startup until daily and monthly spending limits are configured. Relevant current documentation:

- [X API overview](https://docs.x.com/x-api/overview)
- [X API pricing](https://docs.x.com/x-api/getting-started/pricing)
- [X API rate limits](https://docs.x.com/x-api/fundamentals/rate-limits)
- [X Recent Counts](https://docs.x.com/x-api/posts/counts/introduction)
- [X Personalized Trends](https://docs.x.com/x-api/trends/personalized-trends/introduction)

## X Policy and Approval Gate

The current X Developer Guidelines prohibit scraping and browser automation, prohibit AI/ML training on X data except for Grok, and require prior X approval before deploying AI-generated content and replies. X also requires developers to disclose substantive changes to an approved use case before using X Content for the new purpose.

Therefore:

- The Social Brain production app uses only documented X APIs and approved X tools.
- The browser extractor is retired from production and is not replaced with another scraper.
- No production X content is sent through AI generation or judgment until X approves the disclosed Social Brain use case.
- No model is fine-tuned or trained, and no learned model weights are updated from X data.
- Original, reply, and quote recommendations remain human-approved even after X grants deployment approval.
- Development before approval uses synthetic fixtures and Casey-provided non-X test material.

The production service must refuse to enable live AI judgment, AI generation, or X write tools until an auditable X approval reference is configured. Policy review is repeated before each new cohort expansion.

Relevant current policy sources:

- [X Developer Guidelines](https://docs.x.com/developer-guidelines)
- [X Developer Policy](https://docs.x.com/developer-terms/policy)
- [X restricted uses](https://docs.x.com/developer-terms/restricted-use-cases)
- [X Batch Compliance](https://docs.x.com/x-api/compliance/batch-compliance/introduction)

These sources describe policy as of the spec date. The implementation must re-check the current versions before activating production access or expanding cohorts.

## Candidate and Opportunity Scoring

### Stage 1: Eligibility

Reject candidates without a model call when they are stale, duplicated, saturated, inaccessible, irrelevant to Casey's allowed lanes, outside configured safety boundaries, or impossible to answer meaningfully before their window closes.

### Stage 2: Live Potential

Compute deterministic features against time-aware baselines:

- parent-post velocity and acceleration relative to the author's normal performance
- topic-volume acceleration relative to its minute, hour, weekday, and recent-history baselines
- author distribution power and audience proximity
- reply competition and discussion saturation
- freshness and estimated opportunity half-life

Features retain their raw value, normalization method, baseline identifier, capture time, and feature-code version.

### Stage 3: Casey Fit

A model judges whether Casey has audience overlap, topic authority, firsthand evidence, a credible non-obvious angle, and a response that can sound natural in his current voice profile. External post text is untrusted data and cannot issue instructions or tool calls.

### Stage 4: Execution

Generate and evaluate the strongest concrete action, including format, hook, specificity, novelty, proof, conversational leverage, and voice fit. The model chooses among reply, quote, original, and ignore. An opportunity without a publishable draft does not advance.

### Stage 5: Forecast and Priority

Return structured forecasts rather than a generic score:

```text
P(1,000 views within 24h)
P(1,000 views within 48h)
expected views at P10, P50, and P90
forecast confidence
publish-before deadline
recommended action
```

Inbox priority combines predicted hit probability, expected upside, time decay, evidence confidence, and required effort. Low-confidence candidates remain silent.

## Durable Data Contract

### Opportunity

The current materialized record consumed by interfaces. It includes stable identity, schema version, lifecycle status, action type, target identifiers, detection time, publication deadline, forecast, recommended draft reference, evidence references, and scorer provenance.

### SignalEvidence

An immutable record of the source identifiers, captured values, derived non-sensitive features, baselines, and timestamps available when a prediction was made. For third-party Posts, durable records retain IDs and compliant derived evidence. Hydrated text is fetched when needed and kept in an encrypted cache for no more than 24 hours. Casey-owned Post text and drafts may be retained with his explicit consent, subject to the same deletion and modification obligations.

### DraftVariant

The exact suggested content, action type, intended target, angle, voice-profile version, model identifier, prompt-template version, and quality evaluation. Casey's final edited text is preserved separately.

### DecisionEvent

Append-only events such as detected, surfaced, approved, revised, rejected, expired, publishing, published, publish-uncertain, failed, measuring, and matured. Each event records actor, interface, timestamp, event version, and scoped payload.

### OutcomeSnapshot

The explicit published X post ID, publication time, observation age, public metrics, private owned-post metrics when available, capture source, and collection status. Standard snapshots occur at 15 minutes, 1 hour, 6 hours, 24 hours, and 48 hours.

### Contract Invariants

- Predictions and evidence are never overwritten.
- New knowledge creates a new prediction revision.
- Published posts are matched by returned or verified X ID, never fuzzy text.
- Rejected and expired opportunities are unobserved counterfactuals, not failures.
- Every score records model, prompt, feature, strategy, voice, and schema versions.
- Retained third-party X IDs receive Batch Compliance checks at least every 12 hours and after any direct removal notice. Deleted, edited, protected, withheld, or suspended content is updated or removed within 24 hours.

## Lifecycle and Publishing Safety

The valid lifecycle is:

```text
candidate -> eligible -> scored -> surfaced
surfaced -> approved | rejected | expired
approved -> publishing
publishing -> published | publish_uncertain | failed
published -> measuring -> matured
```

An approval creates a short-lived `PublishIntent` scoped to Casey, the exact draft hash, target post, action type, and deadline. Revision invalidates the previous approval. The first valid decision wins across Telegram and MCP.

An internal idempotency key prevents concurrent duplicate sends. Because the current X create-post contract does not expose an idempotency key, an ambiguous network timeout must transition to `publish_uncertain`. The publisher reconciles Casey's recent posts before offering a retry and never retries an uncertain write automatically.

Original posts and replies publish through authenticated X API user access. Current self-serve X access does not support API-created quote posts, so phase-one quote opportunities open a prefilled X composer for Casey's final tap. Relevant current documentation:

- [X create or edit Post](https://docs.x.com/x-api/posts/create-post)
- [X Post metrics](https://docs.x.com/x-api/fundamentals/metrics)

Production model-generated content and X write tools remain disabled until the X Policy and Approval Gate passes. Casey's exact-revision approval is still required after that gate passes.

## Delivery and Model Interfaces

### Telegram

Telegram is the phase-one push adapter. Each notification contains the exact draft, target, forecast, concise evidence, deadline, and Approve, Revise, and Skip actions. Buttons become inactive after the first valid decision or expiration.

### MCP

The remote MCP server exposes narrow domain tools rather than database access:

```text
list_opportunities
nominate_post
inspect_opportunity
explain_prediction
revise_draft
approve_opportunity
reject_opportunity
get_proof_status
get_system_health
```

Mutating tools require authenticated Casey context and use the same decision service as Telegram.

### Skills

Codex and Claude receive thin skills that explain when to inspect, revise, approve, reject, and diagnose opportunities. Skills must not duplicate scoring weights, publishing logic, schemas, or private strategy state. Their job is to help the model call durable tools correctly.

## Learning Model

### Fast Memory

Live topic velocity, author velocity, saturation, freshness, and opportunity half-life update continuously. These market-state changes may rerank an unexpired Opportunity but create a new prediction revision.

### Stable Personal Memory

Casey's directly supplied facts, voice preferences, proof points, approved strategy, and mature outcome summaries are retrieved at inference time. One result cannot permanently change stable strategy. Third-party X text is rehydrated only when required and is not copied into permanent strategy memory.

### No Automatic Model Training

Learning means append-only outcomes, descriptive statistics, retrieval, and explicit versioned policy changes. It does not mean fine-tuning, embedding training, reinforcement learning, or automatic learned-weight updates on X data.

### Champion and Challenger

The champion policy chooses official Primary Bets. Challenger policies are versioned combinations of deterministic features, thresholds, model choices, prompt templates, and retrieval rules. They rerank the same candidate sets in shadow mode. A challenger may replace the champion only through an explicit versioned policy change after mature evidence shows repeatable improvement and it passes regression checks against replay fixtures.

Rejected opportunities remain useful for preference learning but cannot be labeled performance successes or failures. Parent-post trajectory may be retained as contextual evidence, not as the missing Casey outcome.

## Proof Operation

### Baseline

Before the live trial, compute Casey's previous 30-day hit rate, median views, reach distribution, and engagement by action type. Historical data describes the starting point but cannot replace live proof.

### Burn-In

After the X Policy and Approval Gate passes, run 48 hours with real sensing and no X writes. Verify stream uptime, latency, candidate volume, deduplication, delivery, policy controls, model cost, X API spend, and event completeness.

### Live Trial

Publish one predeclared Primary Bet on each of seven consecutive America/Chicago calendar days. The champion must lock the forecast and draft before publication. The daily result passes only when Casey's own post reaches 1,000 views within 48 hours.

### Certification

Certification occurs after the seventh post matures. The clean path is approximately 11 calendar days: two burn-in days, seven posting days, and the final 48-hour maturity window. A miss resets only the live streak; it does not erase historical evidence.

## Failure and Degraded Modes

| Failure | Required behavior |
| --- | --- |
| X stream disconnect | Reconnect, catch up through recent search, deduplicate by Post ID, and expose ingestion lag. |
| X rate limit, depleted credits, or spend breaker | Stop optional reads first, preserve watched-account coverage when safe, and alert Casey. Never exceed configured budgets. |
| Model provider unavailable | Preserve and retry top candidates within their deadline. Do not emit a confident publishing recommendation without the required judgment. |
| Telegram unavailable | Persist the Opportunity, retry delivery, and keep it accessible through MCP. |
| Database unavailable | Stop state transitions and publishing. Resume only after persistence is healthy. |
| Publish result uncertain | Freeze the intent, reconcile before retry, and require a new explicit action if uncertainty remains. |
| X approval reference or compliance state invalid | Disable live AI judgment, generation, and writes. Keep synthetic replay and health inspection available. |

## Security Boundaries

- Treat all X content, bios, links, and quoted text as untrusted data.
- Delimit external content in model inputs and explicitly prohibit instruction following from that content.
- Never expose OAuth tokens, Telegram secrets, database credentials, or approval signing keys to models.
- Encrypt user tokens at rest and use least-privilege X scopes.
- Bind approvals to Casey's authenticated identity and the exact draft hash.
- Record every mutation in the immutable decision ledger.
- Default every publishing test to dry-run; a real canary requires explicit Casey approval.
- Run recurring Batch Compliance jobs and enforce deletion, edit, protection, withholding, and suspension results.
- Never derive or store prohibited sensitive traits about X users.

## Operational Targets

```text
Qualifying signal to alert, p95: under 60 seconds
Stream recovery after disconnect: under 5 minutes
Duplicate publications: zero
Untracked published posts: zero
Production startup without spend limits: prohibited
Production AI or X writes without approval reference: prohibited
```

Health is available through logs, alerts, and `get_system_health`, not a dashboard. It includes ingestion lag, last successful X read, queue age, model errors, Telegram status, database health, policy-approval state, latest compliance run, configured budget remaining, and proof-trial status.

## Testing Strategy

1. **Replay tests:** Feed synthetic and policy-compliant event fixtures at accelerated speed and compare candidates, features, ranking, expiry, and deduplication deterministically.
2. **Contract tests:** Validate every event schema, repository adapter, X adapter, MCP tool, Telegram callback, and model output parser.
3. **Failure tests:** Inject disconnects, duplicates, reordered events, rate limits, expired tokens, provider errors, database failures, and ambiguous publish timeouts.
4. **Shadow tests:** After X approval, run challengers, new features, and model versions against the same live candidate set without affecting the champion or updating model weights.
5. **Live canary:** After the 48-hour burn-in, publish exactly one explicitly approved post and verify its returned ID and outcome schedule before starting the proof streak.

## Migration From the Dashboard

### Preserve

- metric normalization and completeness utilities
- voice-profile derivation and overrides
- draft novelty and quality gates
- generation-context construction and factuality constraints
- official-API capture adapter interfaces
- useful strategy-memory structures and experiment concepts, with stored content revalidated before import
- existing focused unit tests where their behavior remains valid

### Replace

- fixed visible-signal ranking as an opportunity predictor
- fuzzy matching between drafts and published posts
- copy-only production workflow
- mutable or implicit experiment state
- all browser capture and automation paths
- dashboard routes and client components

Before removal, preserve the dashboard through git history and a named archival reference. Do not delete the UI until Slice 2's shadow exit criteria pass. Do not maintain a second production dashboard after headless parity.

Existing unrelated working-tree changes and screenshots are user-owned and must not be included in migration commits unless Casey explicitly requests it.

### Prerequisite: Policy and Access Gate

Before any production X or AI data path is enabled, update the registered X use-case description, obtain the required approval for AI-generated content and replies, record the approval reference, confirm the paid access level supports the intended endpoints, configure spending limits, and document the current retention and deletion obligations.

Engineering may proceed against synthetic fixtures while this gate is pending. Live X AI judgment, generation, and writes may not.

## Delivery Slices

### Slice 1: Headless Brain Foundation

Deliver versioned domain schemas, PostgreSQL event storage, compliant existing-history import, Casey profile and strategy modules, Batch Compliance support, initial read-only MCP tools, thin Codex and Claude skills, and the synthetic replay harness.

Exit: an agent can inspect seeded Opportunities and their complete evidence without loading a dashboard.

### Slice 2: Sense and Rank

After the policy gate passes, deliver official X sensing, manual Post nomination, normalization, eligibility gates, feature calculation, Casey-fit judgment, draft execution, forecasts, budget breakers, and the dry-run Inbox.

Exit: 48 hours of shadow operation with no duplicate Opportunities, configured spend compliance, complete provenance, and p95 qualifying-signal-to-alert latency under 60 seconds.

### Slice 3: Act and Measure

Deliver Telegram and mutating MCP actions, signed approvals, publication coordination, original and reply publishing, quote composer handoff, outcome scheduling, and uncertain-write recovery.

Exit: one explicitly approved canary publishes exactly once and receives complete timed outcome tracking.

### Slice 4: Prove and Improve

Deliver champion and challenger policy evaluation, descriptive calibration reporting, Primary Bet locking, versioned strategy updates, streak state, and certification output without training models on X data.

Exit: seven consecutive Primary Bets each reach at least 1,000 views within 48 hours.

Each slice receives its own implementation spec, implementation plan, tests, and exit verification. No phase-two multi-creator work begins before Slice 4 exits successfully.

## Provider-Neutral Decisions

The architecture intentionally does not bind itself to one cloud vendor, model provider, or agent interface. Slice-level plans must select current providers that meet these constraints:

- a long-running container with restart policy and persistent network connectivity
- managed PostgreSQL with encrypted backups
- secret storage and auditable configuration
- current strong-model structured output support
- provider controls preventing training on or unintended retention of submitted content
- explicit cost ceilings and usage observability

Provider changes must not alter domain schemas, event history, proof rules, or agent tool names without a versioned migration.

## Estimated Delivery

The four engineering slices are estimated at 10 to 16 focused development days before live proof, assuming the X Policy and Approval Gate passes and cloud, Telegram, and model credentials are available. The clean-path burn-in and proof operation requires approximately 11 additional calendar days. X policy approval has no guaranteed turnaround and can extend the schedule independently of engineering. API access restrictions or failed Primary Bets also extend the schedule.
