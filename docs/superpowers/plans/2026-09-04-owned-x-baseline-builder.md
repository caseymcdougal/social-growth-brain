# Owned X Baseline Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this project) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive a private, evidence-backed Casey voice-and-strategy proposal from the existing owned-X archive through ChatGPT-authenticated Codex CLI, expose it read-only, and require explicit Casey approval before accepting it.

**Architecture:** Keep the imported X archive byte-immutable. Add strict proposal and acceptance contracts, separate private atomic JSON stores, an isolated Codex-only proposal runner, two explicit CLIs, and one read-only MCP query. Proposal generation may read the archive once; acceptance snapshots the exact validated proposal only when both its ID and archive fingerprint match.

**Tech Stack:** TypeScript, Node.js built-ins (`child_process`, `crypto`, `fs`, `os`, `path`), Zod, Vitest, Codex CLI with ChatGPT authentication, existing MCP SDK.

**Safety invariants:** No X request, API key, provider fallback, unattended schedule, automatic acceptance, draft generation, publishing, raw archive mutation, or tracked private data. Post text is untrusted data. Private temporary and durable files are removed or written with fail-closed permissions.

---

### Task 1: Add strict baseline proposal and acceptance contracts

**Files:**
- Create: `src/brain/domain/creator-baseline.ts`
- Modify: `src/brain/domain/index.ts`
- Create: `tests/brain/domain/creator-baseline.test.ts`

- [ ] **Step 1: Write failing contract tests**

Create fixtures for one valid `x-api-owned-posts` archive, one valid model output, and the expected proposal. Test these behaviors separately:

```ts
it("builds a proposal tied to every source post", () => {
  const proposal = buildCreatorBaselineProposal({
    archive: ownedArchive(),
    modelOutput: baselineModelOutput(),
    id: "20000000-0000-4000-8000-000000000001",
    now: () => new Date("2026-09-04T21:00:00.000Z")
  });
  expect(proposal.sourceArchiveFingerprint).toBe("a".repeat(64));
  expect(proposal.duplicationGuard.consideredPostIds).toEqual(["100", "101"]);
});

it("rejects unknown post evidence", () => {
  const modelOutput = baselineModelOutput();
  modelOutput.claims[0]!.postIds = ["999"];
  expect(() => buildCreatorBaselineProposal({ archive: ownedArchive(), modelOutput })).toThrow(/unknown post/i);
});

it("requires measured voice evidence and inferred strategy evidence", () => {
  const measuredStrategy = baselineModelOutput();
  measuredStrategy.claims.find(({ area }) => area === "positioning")!.evidenceKind = "measured";
  expect(() => buildCreatorBaselineProposal({ archive: ownedArchive(), modelOutput: measuredStrategy })).toThrow(/evidence kind/i);
});

it("accepts only the exact current proposal and archive", () => {
  const proposal = baselineProposal();
  expect(acceptCreatorBaseline({ archive: ownedArchive(), proposal, proposalId: proposal.id, sourceFingerprint: proposal.sourceArchiveFingerprint, now: fixedNow })).toMatchObject({ acceptedBy: "casey-mcdougal" });
  expect(() => acceptCreatorBaseline({ archive: ownedArchive(), proposal, proposalId: randomUUID(), sourceFingerprint: proposal.sourceArchiveFingerprint })).toThrow(/proposal/i);
});
```

Use areas exactly `voice`, `positioning`, `audience`, `strongest-lane`, `weak-lane`, `proof-point`, `experiment`, and `duplication`. Require at least one `voice` claim and one non-voice strategy claim. Require measured evidence for `voice` and `duplication`; require inferred evidence for every other area.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/brain/domain/creator-baseline.test.ts`

Expected: FAIL because `creator-baseline.ts` and its exports do not exist.

- [ ] **Step 3: Implement the contracts and pure constructors**

Export these exact APIs:

```ts
export const baselineClaimAreaSchema = z.enum([
  "voice", "positioning", "audience", "strongest-lane",
  "weak-lane", "proof-point", "experiment", "duplication"
]);

export const baselineClaimSchema = z.object({
  area: baselineClaimAreaSchema,
  claim: requiredText,
  postIds: z.array(xPostIdSchema).min(1),
  evidenceKind: z.enum(["measured", "inferred"]),
  confidence: z.number().min(0).max(1),
  uncertainty: requiredText
}).strict();

export const creatorBaselineModelOutputSchema = z.object({
  voiceProfile: voiceProfileSchema,
  strategyMemory: strategyMemorySchema,
  duplicationGuard: z.object({ consideredPostIds: z.array(xPostIdSchema).min(1) }).strict(),
  claims: z.array(baselineClaimSchema).min(2),
  largestUncertainty: requiredText
}).strict();

export function buildCreatorBaselineProposal(input: {
  archive: CreatorArchive;
  modelOutput: CreatorBaselineModelOutput;
  id?: string;
  now?: () => Date;
}): CreatorBaselineProposal;

export function acceptCreatorBaseline(input: {
  archive: CreatorArchive;
  proposal: CreatorBaselineProposal;
  proposalId: string;
  sourceFingerprint: string;
  now?: () => Date;
}): AcceptedCreatorBaseline;
```

`CreatorBaselineProposal` must add `schemaVersion: 1`, `creatorId: "casey-mcdougal"`, UUID `id`, ISO `createdAt`, `sourceArchiveFingerprint`, and fixed provenance `{ interface: "codex-cli", model: "codex-cli-chatgpt-default", promptTemplateVersion: "owned-x-baseline-v1" }` to the validated model output.

`AcceptedCreatorBaseline` must contain a deep copy of the full proposal plus `acceptedAt`, `acceptedBy: "casey-mcdougal"`, `acceptedProposalId`, and `acceptedSourceArchiveFingerprint`. Its schema must refine both repeated identifiers against the nested proposal.

Cross-validation must require an owned-X archive with at least one post, exact set equality between `consideredPostIds` and archive post IDs, known and unique claim `postIds`, correct evidence kinds, and voice plus strategy claim coverage.

- [ ] **Step 4: Export and run GREEN**

Add `export * from "./creator-baseline";` to `src/brain/domain/index.ts`.

Run: `npm test -- tests/brain/domain/creator-baseline.test.ts tests/brain/domain/contracts.test.ts`

Expected: PASS with the new contracts and all existing domain contracts intact.

- [ ] **Step 5: Commit the domain layer**

```bash
git add src/brain/domain/creator-baseline.ts src/brain/domain/index.ts tests/brain/domain/creator-baseline.test.ts
git commit -m "feat: add creator baseline contracts"
```

### Task 2: Add private proposal and accepted-baseline file stores

**Files:**
- Create: `src/brain/baseline/local-baseline-store.ts`
- Create: `tests/brain/baseline/local-baseline-store.test.ts`

- [ ] **Step 1: Write failing file-safety tests**

Test both record types through their public APIs:

```ts
expect(readLocalBaselineProposal(proposalPath)).toBeNull();
writeLocalBaselineProposal(proposalPath, baselineProposal());
expect(readLocalBaselineProposal(proposalPath)).toEqual(baselineProposal());
expect(statSync(proposalPath).mode & 0o777).toBe(0o600);

writeLocalAcceptedBaseline(acceptedPath, acceptedBaseline());
expect(readLocalAcceptedBaseline(acceptedPath)).toEqual(acceptedBaseline());
expect(statSync(dirname(acceptedPath)).mode & 0o777).toBe(0o700);
```

Add separate tests for malformed JSON, invalid schemas, final-path symlinks, symlinked parents, directories, FIFOs opened nonblocking, exact permissions under a permissive umask, atomic rename failure, temp-name collision, and preservation of an existing valid record after each failed write.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/brain/baseline/local-baseline-store.test.ts`

Expected: FAIL because the local baseline store does not exist.

- [ ] **Step 3: Implement one internal private-record primitive and four typed wrappers**

Export only:

```ts
export const DEFAULT_BASELINE_PROPOSAL_PATH = resolve("data/social-brain/casey-baseline-proposal.json");
export const DEFAULT_ACCEPTED_BASELINE_PATH = resolve("data/social-brain/casey-baseline.json");

export function readLocalBaselineProposal(path = DEFAULT_BASELINE_PROPOSAL_PATH): CreatorBaselineProposal | null;
export function writeLocalBaselineProposal(path: string, input: CreatorBaselineProposal): CreatorBaselineProposal;
export function readLocalAcceptedBaseline(path = DEFAULT_ACCEPTED_BASELINE_PATH): AcceptedCreatorBaseline | null;
export function writeLocalAcceptedBaseline(path: string, input: AcceptedCreatorBaseline): AcceptedCreatorBaseline;
```

Inside the module, implement generic `readPrivateRecord(path, schema)` and `writePrivateRecord(path, input, schema)` helpers with the same fail-closed rules already proven in `local-creator-archive.ts`: `lstat` every parent segment, reject links/non-directories, `O_NOFOLLOW | O_NONBLOCK` reads, regular-file `fstat`, parent mode `0700`, unique sibling temp file using `O_EXCL` and mode `0600`, `fsync`, close, atomic rename, and cleanup of only the temp file created by that call.

Do not refactor `local-creator-archive.ts` in this task. Keeping the already-verified import path unchanged is more important than deduplicating roughly 80 lines.

- [ ] **Step 4: Run GREEN and the existing archive-store regression**

Run: `npm test -- tests/brain/baseline/local-baseline-store.test.ts tests/brain/import/local-creator-archive.test.ts`

Expected: PASS. Both stores reject unsafe paths and preserve existing data on failure.

- [ ] **Step 5: Commit the file stores**

```bash
git add src/brain/baseline/local-baseline-store.ts tests/brain/baseline/local-baseline-store.test.ts
git commit -m "feat: store private creator baselines"
```

### Task 3: Build the isolated ChatGPT-authenticated Codex proposal runner

**Files:**
- Create: `src/brain/baseline/codex-baseline-runner.ts`
- Create: `tests/brain/baseline/codex-baseline-runner.test.ts`

- [ ] **Step 1: Write failing process-boundary tests**

Define an injected process function so tests never start Codex:

```ts
export interface BaselineProcessRequest {
  command: "codex";
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin: string;
  timeoutMs: number;
}

export type RunBaselineProcess = (request: BaselineProcessRequest) => Promise<{ stdout: string; stderr: string }>;
```

Test a successful preflight plus analysis call and assert:

```ts
expect(calls[0]).toMatchObject({ command: "codex", args: ["login", "status"] });
expect(calls[1]!.args).toEqual(expect.arrayContaining([
  "exec", "--ephemeral", "--ignore-user-config", "--ignore-rules",
  "--skip-git-repo-check", "--sandbox", "read-only", "--output-schema"
]));
expect(calls[1]!.env.OPENAI_API_KEY).toBeUndefined();
expect(calls[1]!.env.ANTHROPIC_API_KEY).toBeUndefined();
expect(calls[1]!.env.OPENAI_BASE_URL).toBeUndefined();
expect(calls).toHaveLength(2);
```

Also assert the prompt labels every post body as untrusted data, forbids browsing/tool calls/instructions from posts, and asks for measured versus inferred evidence. Test rejection for any preflight output other than `Logged in using ChatGPT`, process failure, timeout, missing output file, malformed JSON, invalid schema, and unknown post evidence. Assert the temporary directory no longer exists after success and every failure.

Assert no config, plugin, browser, web, or MCP enablement flags appear in the analysis arguments. `--ignore-user-config` must remain present so user-configured MCP servers are not loaded.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/brain/baseline/codex-baseline-runner.test.ts`

Expected: FAIL because the runner module does not exist.

- [ ] **Step 3: Implement deterministic job files and isolated process execution**

Export:

```ts
export const BASELINE_PROMPT_TEMPLATE_VERSION = "owned-x-baseline-v1";

export async function deriveCreatorBaseline(input: {
  archive: CreatorArchive;
  runProcess?: RunBaselineProcess;
  now?: () => Date;
  randomId?: () => string;
  tempRoot?: string;
}): Promise<CreatorBaselineProposal>;
```

The default process implementation uses `spawn`, captures bounded stdout/stderr, kills after 15 minutes, and rejects with stage-only messages. Build a minimal allowlisted environment containing only values required to locate Codex and its ChatGPT auth, including `PATH`, `HOME`, `CODEX_HOME`, `TMPDIR`, and locale variables when present. Explicitly omit `OPENAI_API_KEY`, `OPENAI_BASE_URL`, Anthropic/provider keys, and all Social Brain/X variables.

Preflight `codex login status` first and require trimmed stdout `Logged in using ChatGPT`. Run the analysis with this fixed argument shape:

```ts
[
  "exec",
  "--ephemeral",
  "--ignore-user-config",
  "--ignore-rules",
  "--skip-git-repo-check",
  "--sandbox", "read-only",
  "--cd", jobDir,
  "--output-schema", schemaPath,
  "--output-last-message", outputPath,
  "-"
]
```

The temporary directory uses `mkdtempSync(join(realpathSync(tempRoot ?? tmpdir()), "social-brain-baseline-"))` followed by `chmodSync(jobDir, 0o700)`. Write input, prompt, and schema with mode `0600`. The input includes only the imported profile, post IDs, text, timestamps, and public metrics. The JSON schema matches `creatorBaselineModelOutputSchema` exactly. Delete the entire job directory in `finally`.

Parse the output with `creatorBaselineModelOutputSchema`, then call `buildCreatorBaselineProposal`. Never log the prompt, raw result, post text, or child stderr.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- tests/brain/baseline/codex-baseline-runner.test.ts tests/brain/domain/creator-baseline.test.ts`

Expected: PASS with exactly one preflight and one analysis process call per successful run.

- [ ] **Step 5: Commit the runner**

```bash
git add src/brain/baseline/codex-baseline-runner.ts tests/brain/baseline/codex-baseline-runner.test.ts
git commit -m "feat: derive creator baseline with Codex"
```

### Task 4: Add explicit proposal and acceptance CLIs

**Files:**
- Create: `src/brain/baseline/propose-baseline.ts`
- Create: `src/brain/baseline/propose-cli.ts`
- Create: `src/brain/baseline/accept-baseline.ts`
- Create: `src/brain/baseline/accept-cli.ts`
- Create: `tests/brain/baseline/propose-baseline.test.ts`
- Create: `tests/brain/baseline/baseline-cli.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing orchestration tests**

For proposal generation, inject archive reads, runner, and proposal writer. Verify the source file bytes are identical before and after model execution:

```ts
const result = await proposeCreatorBaseline({
  archivePath,
  derive: async ({ archive }) => buildCreatorBaselineProposal({ archive, modelOutput: baselineModelOutput() }),
  writeProposal
});
expect(readFileSync(archivePath)).toEqual(beforeBytes);
expect(writeProposal).toHaveBeenCalledOnce();
expect(result.sourceArchiveFingerprint).toBe(archive.sourceFingerprint);
```

Mutate the archive from the injected runner and assert the proposal writer is never called. Add tests for absent archive, empty archive, wrong source, invalid derived proposal, and read errors.

For acceptance, verify exact argument parsing, proposal/archive reload, stale ID rejection, stale fingerprint rejection, and preservation of an existing accepted baseline after any failure. Assert no accepted file exists after proposal generation alone.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/brain/baseline/propose-baseline.test.ts tests/brain/baseline/baseline-cli.test.ts`

Expected: FAIL because the orchestration and CLI modules do not exist.

- [ ] **Step 3: Implement proposal orchestration**

Export:

```ts
export async function proposeCreatorBaseline(input?: {
  archivePath?: string;
  proposalPath?: string;
  derive?: typeof deriveCreatorBaseline;
  writeProposal?: typeof writeLocalBaselineProposal;
}): Promise<CreatorBaselineProposal>;
```

Read the archive bytes once, parse them with `creatorArchiveSchema`, require `source === "x-api-owned-posts"` and at least one post, and calculate a SHA-256 byte hash. Run the injected derive function. Re-read the raw bytes, compare with `timingSafeEqual`, and fail with `Owned X archive changed during baseline analysis` before persistence on any mismatch. Cross-validate the returned proposal against the original parsed archive, then atomically write it.

`propose-cli.ts` accepts no arguments, calls the service once, and prints exactly three lines: proposal ID, source fingerprint, and claim count. All errors become `Baseline proposal failed. No proposal was written.` on stderr without raw content.

- [ ] **Step 4: Implement explicit acceptance**

Export:

```ts
export function parseBaselineAcceptArgs(args: readonly string[]): {
  proposalId: string;
  sourceFingerprint: string;
};

export function acceptLocalCreatorBaseline(input: {
  proposalId: string;
  sourceFingerprint: string;
  archivePath?: string;
  proposalPath?: string;
  acceptedPath?: string;
  now?: () => Date;
}): AcceptedCreatorBaseline;
```

Require arguments in exactly this form and reject duplicates or extras:

```text
--proposal-id <uuid> --source-fingerprint <64 lowercase hex characters>
```

Reload and validate the archive and proposal, call `acceptCreatorBaseline`, then atomically write the accepted record. `accept-cli.ts` prints only accepted proposal ID, source fingerprint, and acceptance timestamp. It must never create or update the proposal or archive.

Add scripts:

```json
"brain:baseline:propose": "tsx src/brain/baseline/propose-cli.ts",
"brain:baseline:accept": "tsx src/brain/baseline/accept-cli.ts"
```

- [ ] **Step 5: Run GREEN**

Run: `npm test -- tests/brain/baseline/propose-baseline.test.ts tests/brain/baseline/baseline-cli.test.ts`

Expected: PASS. Proposal generation never writes acceptance, stale inputs fail closed, and archive bytes remain unchanged.

- [ ] **Step 6: Commit the CLIs**

```bash
git add package.json src/brain/baseline/propose-baseline.ts src/brain/baseline/propose-cli.ts src/brain/baseline/accept-baseline.ts src/brain/baseline/accept-cli.ts tests/brain/baseline/propose-baseline.test.ts tests/brain/baseline/baseline-cli.test.ts
git commit -m "feat: add creator baseline approval flow"
```

### Task 5: Expose baseline state through the read-only local MCP

**Files:**
- Modify: `src/brain/query/brain-query-service.ts`
- Modify: `src/brain/interfaces/mcp/create-server.ts`
- Modify: `src/brain/interfaces/mcp/local-server.ts`
- Modify: `src/brain/interfaces/mcp/synthetic-stdio.ts`
- Modify: `tests/brain/query/brain-query-service.test.ts`
- Modify: `tests/brain/interfaces/mcp-server.test.ts`
- Modify: `tests/brain/interfaces/local-mcp.test.ts`
- Modify: `tests/brain/interfaces/synthetic-mcp.test.ts`
- Modify: `src/brain/dev/verify-slice-1.ts`
- Modify: `tests/brain/dev/verify-slice-1.test.ts`

- [ ] **Step 1: Write failing query and MCP tests**

Define a read-only snapshot passed into the query service:

```ts
export interface CreatorBaselineSnapshot {
  currentArchiveFingerprint: string | null;
  proposal: CreatorBaselineProposal | null;
  accepted: AcceptedCreatorBaseline | null;
}
```

Test these results:

```ts
expect(service.getCreatorBaseline()).toEqual({
  proposalAvailable: true,
  acceptedAvailable: false,
  proposalMatchesCurrentArchive: true,
  acceptedMatchesCurrentArchive: false,
  proposal,
  accepted: null
});
```

Update expected MCP tools to include `get_creator_baseline`. Through `createLocalMcpServer`, test proposal only, proposal plus accepted baseline, absent optional files, stale files reporting `*MatchesCurrentArchive: false`, invalid files failing startup, three unchanged synthetic Opportunities, and every capability still denied.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/brain/query/brain-query-service.test.ts tests/brain/interfaces/mcp-server.test.ts tests/brain/interfaces/local-mcp.test.ts tests/brain/interfaces/synthetic-mcp.test.ts`

Expected: FAIL because the baseline snapshot and MCP tool do not exist.

- [ ] **Step 3: Add the read-only query and MCP schema**

Extend the `BrainQueryService` constructor with an optional third argument defaulting to all-null state. Parse and deep-clone its proposal and accepted values on construction. Add synchronous `getCreatorBaseline()` returning the booleans and records above.

Register `get_creator_baseline` with zero input. Its output schema must be strict and use `creatorBaselineProposalSchema` plus `acceptedCreatorBaselineSchema`. The description must say that it inspects local proposal/accepted state and never generates or accepts anything.

Do not add a mutating MCP tool or change `get_proof_status` or the policy gate.

- [ ] **Step 4: Load optional private baseline files only in the local server**

Extend local options:

```ts
export interface CreateLocalMcpServerOptions {
  readonly archivePath?: string | null;
  readonly proposalPath?: string | null;
  readonly acceptedBaselinePath?: string | null;
}
```

Default undefined values to the three private data paths. A `null` option disables that file. Read the archive first, then proposal and accepted baseline. Pass their validated values and current archive fingerprint into `BrainQueryService`.

Change `createSyntheticMcpServer()` to pass all three options as `null`, preserving a fixture-only server that never reads disk.

- [ ] **Step 5: Update Slice 1 verification**

Add `get_creator_baseline` to the exact expected tool list. The Postgres-backed verifier has no local baseline files, so assert both records unavailable while retaining the existing archive and denied-capability assertions.

- [ ] **Step 6: Run GREEN and commit**

Run: `npm test -- tests/brain/query/brain-query-service.test.ts tests/brain/interfaces/mcp-server.test.ts tests/brain/interfaces/local-mcp.test.ts tests/brain/interfaces/synthetic-mcp.test.ts tests/brain/dev/verify-slice-1.test.ts`

Expected: PASS with exactly seven read-only tools and no live capability changes.

```bash
git add src/brain/query/brain-query-service.ts src/brain/interfaces/mcp/create-server.ts src/brain/interfaces/mcp/local-server.ts src/brain/interfaces/mcp/synthetic-stdio.ts src/brain/dev/verify-slice-1.ts tests/brain/query/brain-query-service.test.ts tests/brain/interfaces/mcp-server.test.ts tests/brain/interfaces/local-mcp.test.ts tests/brain/interfaces/synthetic-mcp.test.ts tests/brain/dev/verify-slice-1.test.ts
git commit -m "feat: expose creator baseline read only"
```

### Task 6: Document, verify, install, and generate the real proposal

**Files:**
- Modify: `docs/social-brain/slice-1-runbook.md`
- Modify: `/Users/caseymcdougal/plugins/social-growth-brain/.codex-plugin/plugin.json`
- Modify: `/Users/caseymcdougal/plugins/social-growth-brain/skills/social-growth-brain/SKILL.md`

- [ ] **Step 1: Update the runbook and plugin boundary**

Document both commands, ChatGPT-only authentication, transient raw-post job files, durable private proposal/accepted paths, zero direct API billing, and the explicit acceptance requirement.

Update the plugin manifest and skill to state:

- the plugin can inspect the raw owned archive plus proposal and accepted baseline
- the plugin itself never starts Codex or X
- proposal generation is a separate user-started local command
- acceptance requires an exact Casey-approved proposal ID and source fingerprint
- current Opportunities and forecasts remain synthetic
- no refresh, mutation, publishing, or recurring spend capability exists

- [ ] **Step 2: Run the complete verification gate before real data processing**

Run:

```bash
npm test -- tests/brain/domain/creator-baseline.test.ts tests/brain/baseline/local-baseline-store.test.ts tests/brain/baseline/codex-baseline-runner.test.ts tests/brain/baseline/propose-baseline.test.ts tests/brain/baseline/baseline-cli.test.ts tests/brain/interfaces/local-mcp.test.ts
npm run test:brain
npm test
npm run build
npm run brain:verify:slice1
npm audit --omit=dev --json
git diff --check
```

Expected: every test/build/verifier exits 0, npm audit reports zero production vulnerabilities, and diff check has no output.

Confirm private files remain untracked:

```bash
git check-ignore -v data/social-brain/casey-owned-post-history.json data/social-brain/casey-baseline-proposal.json data/social-brain/casey-baseline.json
git ls-files data/social-brain
```

Expected: all three paths match `data/` ignore rules; `git ls-files` prints nothing.

- [ ] **Step 3: Update and reinstall the existing personal plugin**

Read the marketplace name:

```bash
python3 /Users/caseymcdougal/.codex/skills/.system/plugin-creator/scripts/read_marketplace_name.py
```

Bump and validate the source plugin:

```bash
python3 /Users/caseymcdougal/.codex/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py /Users/caseymcdougal/plugins/social-growth-brain
python3 /Users/caseymcdougal/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py /Users/caseymcdougal/plugins/social-growth-brain
```

Reinstall from the validated `personal` marketplace returned by the first command:

```bash
codex plugin add social-growth-brain@personal
```

Expected: plugin validation and reinstall succeed. Do not manually edit marketplace configuration.

- [ ] **Step 4: Commit the runbook before processing the archive**

```bash
git add docs/social-brain/slice-1-runbook.md
git commit -m "docs: document creator baseline workflow"
```

Tasks 1 through 5 already commit the implementation in focused increments. Run `git status --short --branch` and verify the repository is clean; intentional source-plugin changes live outside this repository.

- [ ] **Step 5: Generate the real proposal without accepting it**

Record the raw archive hash without printing content:

```bash
shasum -a 256 data/social-brain/casey-owned-post-history.json
npm run brain:baseline:propose
shasum -a 256 data/social-brain/casey-owned-post-history.json
```

Expected: both archive hashes are identical. The command prints only proposal ID, source archive fingerprint, and claim count. `data/social-brain/casey-baseline-proposal.json` exists with mode `0600`; `data/social-brain/casey-baseline.json` does not exist.

- [ ] **Step 6: Inspect the proposal and stop for Casey's decision**

Start a fresh local MCP process in a test client, call `get_creator_baseline`, and present Casey with:

- proposed positioning
- voice summary and strongest voice rules
- strongest and weakest lanes
- proof points and experiments
- measured versus inferred evidence references
- largest uncertainty
- exact proposal ID and source fingerprint required for acceptance

Do not run `brain:baseline:accept`. Stop and request explicit approval or revisions to the proposal.

## Final Acceptance Gate

Only after Casey explicitly approves the displayed proposal, run the exact `npm run brain:baseline:accept` command prepared in Step 6 with the real proposal ID and source fingerprint Casey saw. The command must contain both literal values; do not substitute aliases such as `current` or re-read a newer proposal after approval.

Then verify `get_creator_baseline` reports `acceptedAvailable: true`, `acceptedMatchesCurrentArchive: true`, and an accepted proposal ID identical to the one Casey approved. This final acceptance is not part of unattended implementation execution.
