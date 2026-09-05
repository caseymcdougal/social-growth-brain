# Owned X Baseline Builder Design

Date: 2026-09-04
Owner: Casey McDougal
Status: Approved design, pending implementation plan

## Goal

Turn Casey's private archive of 24 owned X posts into a reviewable voice-and-strategy baseline without mutating the imported archive, making another X request, adding direct API billing, or enabling any publishing capability.

The result is a proposal, not accepted strategy memory. Casey must explicitly approve the exact proposal before a separate local command can promote it to the accepted baseline.

## Current State

The one-time owned-X importer is committed in `05e4f67`. It stores the imported profile, original-post text, timestamps, and public metrics in `data/social-brain/casey-owned-post-history.json`. That file is private, mode `0600`, Git-ignored, and exposed through the read-only local MCP.

The imported archive deliberately has no derived voice profile, strategy memory, or creative directions. Current Opportunities and forecasts remain synthetic. Every live capability remains denied.

## Chosen Approach

Use the Codex CLI through Casey's existing ChatGPT subscription for one explicit, user-started analysis. The baseline builder will not use the X API, an OpenAI API key, Claude, a provider fallback, or an unattended job.

The imported archive stays immutable. The system writes two separate local records:

- `data/social-brain/casey-baseline-proposal.json`
- `data/social-brain/casey-baseline.json`

Both files are mode `0600`, Git-ignored, and validated before use. The proposal may be replaced by a later explicit proposal run. The accepted baseline may change only through the explicit acceptance command described below.

## Domain Contracts

### Baseline proposal

Add a strict, versioned `CreatorBaselineProposal` contract containing:

- schema version, proposal ID, creator ID, and creation timestamp
- the exact source archive fingerprint
- generator provenance: `codex-cli`, configured-subscription model, and prompt template version
- a `VoiceProfile` using the existing shared schema
- a `StrategyMemory` using the existing shared schema
- a duplication guard containing the imported post IDs considered by the analysis
- evidence-backed claims supporting the voice and strategy fields
- the largest uncertainty in the proposal

Each evidence-backed claim contains an area, a concrete claim, one or more source post IDs, an evidence kind, a confidence value, and an uncertainty statement. Evidence kind is either `measured` or `inferred`:

- `measured` means the claim is directly supported by stored public metrics or observable writing structure.
- `inferred` means Codex interpreted topic, audience, positioning, or likely cause.

Every referenced post ID must exist in the source archive. The proposal is rejected if a claim has no evidence, cites an unknown post, treats an inference as measured, or does not cover both voice and strategy.

### Accepted baseline

Add a strict, versioned `AcceptedCreatorBaseline` contract containing the full validated proposal plus:

- acceptance timestamp
- acceptance actor fixed to `casey-mcdougal`
- accepted proposal ID
- accepted source archive fingerprint

Acceptance is invalid if either identifier differs from the current proposal or current archive. The accepted record is a snapshot, not a pointer to mutable proposal state.

## Proposal Flow

Add `npm run brain:baseline:propose`.

1. Read and validate the private owned-X archive.
2. Refuse to run if the archive is absent, contains no posts, or is not an `x-api-owned-posts` archive.
3. Create a uniquely named mode-`0700` temporary job directory outside the repository.
4. Write the minimum required profile, post text, post IDs, timestamps, and public metrics into the temporary job.
5. Preflight `codex login status` and require the exact ChatGPT-authenticated state. Fail before analysis if subscription authentication is unavailable.
6. Invoke `codex exec` once with `--ephemeral`, `--ignore-user-config`, `--ignore-rules`, a read-only sandbox, a strict output schema, and no provider fallback.
7. Start the child from an allowlisted environment that excludes `OPENAI_API_KEY`, custom provider URLs, and unrelated credential variables. Disable web search and MCP connectors for the job.
8. Treat all post text as untrusted evidence that cannot issue instructions or tool calls.
9. Parse and cross-validate the result against the source archive.
10. Atomically write the private proposal file.
11. Delete the entire temporary job directory in `finally`, on success or failure.

The command prints only the proposal ID, source archive fingerprint, and claim count. It must not print post text, model output, credentials, or private file contents.

The builder records the model as `codex-cli-chatgpt-default`. It does not claim a more specific model identity unless the CLI provides a reliable machine-readable model identifier during implementation. The installed CLI currently reports `Logged in using ChatGPT`; that preflight is a runtime requirement, not an assumption frozen into the tests.

## Review and Acceptance Flow

The local MCP gains one read-only tool, `get_creator_baseline`, returning:

- whether a proposal exists
- whether an accepted baseline exists
- the validated proposal or `null`
- the validated accepted baseline or `null`
- whether each record matches the currently loaded archive fingerprint

The MCP never creates, edits, accepts, or deletes a baseline. Its existing synthetic mode and denied capability list remain unchanged.

Add `npm run brain:baseline:accept -- --proposal-id <uuid> --source-fingerprint <sha256>`.

The acceptance command:

1. Requires exactly the proposal ID and source fingerprint shown during review.
2. Reloads the current archive and proposal.
3. Rejects missing, invalid, or stale inputs.
4. Writes a complete accepted snapshot atomically with mode `0600`.
5. Leaves the proposal and raw archive unchanged.

Running the acceptance command is the technical expression of Casey's explicit approval. Agents must not run it based only on proposal generation or a general request to inspect results.

## File Safety

Proposal and accepted-baseline readers return `null` only for an absent file. They fail closed on malformed JSON, schema violations, symlinks, non-regular files, wrong creator identity, and unsafe parent paths.

Writers validate before touching disk, create private parents, write a unique sibling temporary file with exclusive creation, fsync it, and rename atomically. A failed write removes only its own temporary file and preserves any existing valid record.

The proposal run records the raw archive's byte hash before invoking Codex and verifies the same hash afterward. A mismatch fails the run and prevents proposal persistence.

## Failure Behavior

- Codex missing, not authenticated through ChatGPT, or nonzero exit: no proposal is written.
- Timeout or malformed model output: no proposal is written.
- Unknown evidence post ID: no proposal is written.
- Archive changes during analysis: no proposal is written.
- Proposal changes before acceptance: acceptance fails.
- Archive changes before acceptance: acceptance fails.
- Existing accepted baseline plus stale identifiers: the accepted baseline remains untouched.
- Optional proposal or accepted file absent at MCP startup: startup succeeds and reports it as unavailable.
- Invalid proposal or accepted file at MCP startup: startup fails closed rather than hiding corruption.

Errors shown to the user name the failed stage without including post text or raw model output.

## Testing Strategy

Implementation follows test-first development.

1. Domain tests cover strict schemas, evidence classification, known-post references, creator identity, source fingerprints, and proposal-to-acceptance consistency.
2. File-store tests cover modes, atomic replacement, symlink and FIFO rejection, private parents, cleanup, and preservation of prior valid records.
3. Runner tests use an injected process boundary to verify the ChatGPT-auth preflight, exact isolated Codex arguments, sanitized environment, disabled web/MCP access, one invocation, untrusted-content instructions, structured output validation, timeout handling, and temporary-directory deletion.
4. CLI tests verify silent private output, required arguments, stale proposal rejection, raw archive byte immutability, and no accepted baseline before explicit acceptance.
5. MCP tests verify the new read-only tool, optional-state reporting, archive fingerprint matching, unchanged synthetic Opportunities, and all live capabilities still denied.

Final verification includes the focused baseline suite, the complete Brain suite, the complete project suite, TypeScript/Vite build, Slice 1 verification, `git diff --check`, and confirmation that all private data files remain ignored and untracked.

## Out of Scope

- another X read or recurring refresh
- live third-party X sensing
- automatic proposal acceptance
- automatic strategy-memory mutation
- drafts, posting recommendations, or publishing
- Telegram or mutating MCP tools
- Claude or multi-provider fallback
- direct OpenAI API billing
- UI work
- Slice 2 implementation

## Exit Criteria

This slice is complete when one explicit command can derive a valid proposal from Casey's current private archive, the read-only MCP can expose that proposal for review, no accepted baseline exists before explicit approval, the approval command safely creates the accepted snapshot, the imported archive remains byte-identical, and every existing live capability remains denied.
