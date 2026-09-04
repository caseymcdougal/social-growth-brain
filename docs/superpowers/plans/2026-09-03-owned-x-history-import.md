# Owned X Post History Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import up to 25 of Casey's own X posts once through the official X API, store them privately on disk, and expose them as read-only local MCP history without enabling any live Social Brain capability.

**Architecture:** A built-in Node OAuth 2.0 PKCE loopback flow obtains an in-memory read token, a fixed-host X client makes exactly a profile call and one timeline call, and a strict archive writer atomically saves a git-ignored JSON archive. The normal local MCP launcher continues to replay synthetic opportunities, optionally loading the private archive and exposing it through one new read-only tool.

**Tech Stack:** TypeScript, Node.js built-ins (`crypto`, `http`, `fs`, `path`), `fetch`, Zod, Vitest, the existing MCP SDK.

**Safety invariant:** No browser scraping, arbitrary X URL, bearer-token configuration, refresh token, AI processing, X write, recurring job, or post count above 25. Do not commit; this worktree already contains Casey-owned changes.

---

### Task 1: Add the private owned-history archive contract and file store

**Files:**
- Modify: `src/brain/domain/creator-archive.ts`
- Create: `src/brain/import/local-creator-archive.ts`
- Create: `tests/brain/import/local-creator-archive.test.ts`

- [ ] **Step 1: Write failing source and file-safety tests**

Add tests that construct a valid archive with `source: "x-api-owned-posts"` and `consentBasis: "casey-approved-x-owned-post-import"`, then assert all of the following:

```ts
expect(readLocalCreatorArchive(archivePath)).toBeNull();
writeLocalCreatorArchive(archivePath, archive);
expect(readLocalCreatorArchive(archivePath)).toEqual(archive);
expect(statSync(archivePath).mode & 0o777).toBe(0o600);
expect(() => readLocalCreatorArchive(symlinkPath)).toThrow("symlink");
expect(() => writeLocalCreatorArchive(archivePath, invalidArchive)).toThrow();
```

Use a `mkdtempSync(join(tmpdir(), "social-brain-owned-history-"))` directory and remove only that directory in `afterEach`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/brain/import/local-creator-archive.test.ts`
Expected: FAIL because the source enum and archive reader/writer do not exist.

- [ ] **Step 3: Extend the archive schema without weakening legacy validation**

Replace the two source/consent literals with closed enums:

```ts
const creatorArchiveSourceSchema = z.enum(["legacy-sqlite", "x-api-owned-posts"]);
const creatorArchiveConsentSchema = z.enum([
  "casey-requested-import",
  "casey-approved-x-owned-post-import"
]);
```

Use these schemas in `creatorArchiveSchema`. Do not change any profile, post, fingerprint, or imported-count validation.

- [ ] **Step 4: Implement a fixed-path safe local archive reader/writer**

In `local-creator-archive.ts`, export:

```ts
export const DEFAULT_OWNED_X_ARCHIVE_PATH = resolve("data/social-brain/casey-owned-post-history.json");
export function readLocalCreatorArchive(path = DEFAULT_OWNED_X_ARCHIVE_PATH): CreatorArchive | null;
export function writeLocalCreatorArchive(path: string, input: CreatorArchive): CreatorArchive;
```

The reader must return `null` only for `ENOENT`; reject symlinks, non-regular files, JSON parse errors, invalid schemas, and an archive whose source is not `x-api-owned-posts`. The writer must validate the input, create the parent mode `0700`, write a uniquely named sibling temp file with `wx` and mode `0600`, fsync/close it, rename it over the final path, and remove only its own temp file on failure. It must never follow a target symlink or leave a partial final file.

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- tests/brain/import/local-creator-archive.test.ts tests/brain/import/legacy-sqlite-reader.test.ts`
Expected: PASS; legacy import retains its old literal values and owned-history persistence is private and fail-closed.

### Task 2: Build the fixed-host, maximum-25 official X reader

**Files:**
- Create: `src/brain/import/x-owned-posts-client.ts`
- Create: `tests/brain/import/x-owned-posts-client.test.ts`

- [ ] **Step 1: Write failing client tests using only mocked fetch calls**

Test a fake `fetch` and assert the exact two URLs and no third call:

```ts
expect(calls).toEqual([
  expect.stringContaining("https://api.x.com/2/users/me?"),
  expect.stringContaining("https://api.x.com/2/users/123/tweets?")
]);
expect(new URL(calls[1]!).searchParams.get("max_results")).toBe("25");
expect(new URL(calls[1]!).searchParams.get("exclude")).toBe("retweets,replies");
expect(calls).toHaveLength(2);
```

Include tests for wrong authenticated username, HTTP error, malformed data, retweet/reply filtering, and an over-25 request. Assert thrown messages never contain the supplied token.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/brain/import/x-owned-posts-client.test.ts`
Expected: FAIL because the X reader module does not exist.

- [ ] **Step 3: Implement an injected-fetch X client with no configurable host**

Export the fixed constants and functions:

```ts
export const OWNED_X_POST_LIMIT = 25;
export const OWNED_X_IMPORT_BUDGET_CENTS = 5;
export const OWNED_X_READ_SCOPES = ["tweet.read", "users.read"] as const;
export async function fetchOwnedXCreatorArchive(input: {
  accessToken: string;
  now?: () => Date;
  fetch?: typeof fetch;
  maxPosts?: number;
}): Promise<CreatorArchive>;
```

Use the literal `https://api.x.com/2/` base. Reject an absent/blank token and `maxPosts !== 25`; make `GET /2/users/me` with `description,public_metrics,username,name`, require lowercased username `caseymcdougal`, then make exactly one `GET /2/users/{id}/tweets` request with the documented fields and `exclude=retweets,replies`. Parse unknown JSON defensively, normalize only numeric nonnegative metrics, filter malformed/reply/repost records, and build a `x-api-owned-posts` archive with an SHA-256 fingerprint over normalized content excluding random ID and import timestamp. Use status-only API error messages.

- [ ] **Step 4: Run the focused client tests**

Run: `npm test -- tests/brain/import/x-owned-posts-client.test.ts`
Expected: PASS with exactly two requests on the happy path and no host/token escape path.

### Task 3: Add a one-time PKCE loopback runner and import CLI

**Files:**
- Create: `src/brain/import/x-oauth-pkce.ts`
- Create: `src/brain/import/x-owned-posts-cli.ts`
- Create: `tests/brain/import/x-oauth-pkce.test.ts`
- Create: `tests/brain/import/x-owned-posts-cli.test.ts`
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Write failing PKCE and CLI orchestration tests**

Cover deterministic random bytes, a valid `http://127.0.0.1:<port>/callback` redirect, invalid host/protocol/path rejection, exact authorization parameters, mismatched state rejection, timeout cleanup, and a CLI happy path that writes an archive without putting the token into stdout/stderr. Use injected `authorize`, `waitForCode`, `exchangeCode`, `readArchive`, and `writeArchive` dependencies; do not make a live network call.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- tests/brain/import/x-oauth-pkce.test.ts tests/brain/import/x-owned-posts-cli.test.ts`
Expected: FAIL because the OAuth and CLI modules do not exist.

- [ ] **Step 3: Implement PKCE as a loopback-only, user-mediated protocol helper**

Export:

```ts
export const X_OAUTH_REDIRECT_URI = "http://127.0.0.1:8787/callback";
export function createPkceAuthorization(input: { clientId: string; redirectUri?: string; randomBytes?: typeof randomBytes }): { authorizationUrl: URL; state: string; codeVerifier: string };
export async function waitForPkceCallback(input: { expectedState: string; redirectUri?: string; timeoutMs?: number }): Promise<string>;
export async function exchangePkceCode(input: { clientId: string; redirectUri: string; code: string; codeVerifier: string; fetch?: typeof fetch }): Promise<string>;
```

Use S256, a 32-byte random state, a 64-byte verifier, and scopes exactly `tweet.read users.read`. The callback server binds only to `127.0.0.1`, accepts only `GET /callback`, sends a plain success page with no token/code, rejects every non-loopback or mismatched-state request, and closes on completion/error/timeout. The token exchange POST targets the literal `https://api.x.com/2/oauth2/token`; it includes no client secret and never includes `offline.access` or a write scope.

- [ ] **Step 4: Implement the CLI with an explicit $0.05 envelope**

Add `brain:import:x-owned` to `package.json`, pointing at `tsx src/brain/import/x-owned-posts-cli.ts`. The CLI must require a nonblank `SOCIAL_BRAIN_X_OAUTH_CLIENT_ID`, print only the authorization URL to stderr, wait for the user-mediated callback, call `fetchOwnedXCreatorArchive` once, save `DEFAULT_OWNED_X_ARCHIVE_PATH`, and print only archive ID/fingerprint/post count to stdout. Reject additional arguments and report the fixed five-cent envelope before opening the authorization URL. Clear token/code references in `finally` paths where possible; do not serialize them.

Replace the old hosted-MCP/bearer-token instructions in `.env.example` with comments that describe the nonsecret OAuth client ID, fixed loopback redirect, read-only scopes, fixed $0.05 envelope, and local archive path. Do not add a real client ID to the file.

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- tests/brain/import/x-oauth-pkce.test.ts tests/brain/import/x-owned-posts-cli.test.ts`
Expected: PASS; PKCE remains loopback-only and CLI output has no token.

### Task 4: Expose the optional private archive through the local MCP plugin

**Files:**
- Modify: `src/brain/query/brain-query-service.ts`
- Modify: `src/brain/interfaces/mcp/create-server.ts`
- Modify: `src/brain/interfaces/mcp/synthetic-stdio.ts`
- Create: `src/brain/interfaces/mcp/local-server.ts`
- Create: `src/brain/interfaces/mcp/local-stdio.ts`
- Modify: `tests/brain/interfaces/mcp-server.test.ts`
- Modify: `tests/brain/interfaces/synthetic-mcp.test.ts`
- Create: `tests/brain/interfaces/local-mcp.test.ts`
- Modify: `package.json`
- Modify: `/Users/caseymcdougal/plugins/social-growth-brain/.mcp.json`
- Modify: `/Users/caseymcdougal/plugins/social-growth-brain/.codex-plugin/plugin.json`
- Modify: `/Users/caseymcdougal/plugins/social-growth-brain/skills/social-growth-brain/SKILL.md`

- [ ] **Step 1: Write failing MCP contract tests**

Update the expected registered tool names to include `get_creator_archive`. Add a local-server test that creates a private fixture archive, starts a linked in-memory MCP client, and asserts:

```ts
expect((await client.callTool({ name: "get_creator_archive", arguments: {} })).structuredContent)
  .toMatchObject({ available: true, archive: { source: "x-api-owned-posts" } });
expect(health.capabilities.every(({ allowed }) => !allowed)).toBe(true);
expect(listed.opportunities).toHaveLength(3);
```

Test missing archive returns `{ available: false, archive: null }` and does not fail server startup.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- tests/brain/interfaces/mcp-server.test.ts tests/brain/interfaces/local-mcp.test.ts`
Expected: FAIL because the archive tool and local launcher do not exist.

- [ ] **Step 3: Add a strictly read-only archive query and MCP tool**

Add `getCreatorArchive()` to `BrainQueryService`, returning the latest archive or `null`. Register a zero-input `get_creator_archive` tool with this Zod output:

```ts
z.object({
  available: z.boolean(),
  archive: creatorArchiveSchema.nullable()
})
```

Extend `get_system_health` output with a `creatorArchive` object containing `available`, `source`, and `importedAt`, while retaining `mode: "synthetic"` and all denied live capabilities. Do not register any mutation or X-access tool.

- [ ] **Step 4: Add an archive-aware local launcher without changing synthetic behavior**

Create `local-server.ts` with a `createLocalMcpServer({ archivePath? })` factory that replays the three fixtures into an `InMemoryBrainEventStore`, calls `readLocalCreatorArchive`, and appends a present archive. Keep `createSyntheticMcpServer()` as the no-file fixture launcher for tests by having it call the factory with an explicit no-archive option. Add `brain:mcp:local` pointing to `local-stdio.ts`; that launcher uses the default archive path and never starts OAuth or a network call.

- [ ] **Step 5: Update and validate the local plugin**

Point the plugin MCP server at `brain:mcp:local`. Update its manifest and skill to say that it serves synthetic opportunities plus an optional Casey-owned local archive, never runs the importer itself, and cannot publish, refresh, or make network calls. Bump the cachebuster with the plugin-creator helper, validate the source plugin, reinstall the existing personal plugin, and use a fresh Codex task only after all local tests pass.

- [ ] **Step 6: Run focused MCP tests**

Run: `npm test -- tests/brain/interfaces/mcp-server.test.ts tests/brain/interfaces/synthetic-mcp.test.ts tests/brain/interfaces/local-mcp.test.ts`
Expected: PASS; archive inspection is optional and every capability remains denied.

### Task 5: Remediate production dependency advisories and verify the complete safe path

**Files:**
- Modify: `package-lock.json` (and `package.json` only if npm requires a safe direct-range update)
- Modify: `.env.example`
- Modify: `docs/social-brain/slice-1-runbook.md`

- [ ] **Step 1: Record the pre-fix audit baseline**

Run: `/opt/homebrew/bin/npm audit --omit=dev --json`
Expected before remediation: 2 high and 3 moderate production advisories in the lockfile, including `fast-uri`, `ip-address`, `@hono/node-server`, `hono`, and `qs`.

- [ ] **Step 2: Apply only npm's nonbreaking production dependency remediation**

Run: `/opt/homebrew/bin/npm audit fix --omit=dev`
Expected: update only dependency metadata/lock resolution needed by available nonbreaking fixes. Do not use `--force`, do not upgrade unrelated major versions, and inspect the resulting `package.json`/`package-lock.json` diff before proceeding.

- [ ] **Step 3: Re-run the audit and stop on any high production finding**

Run: `/opt/homebrew/bin/npm audit --omit=dev --json`
Expected: zero high vulnerabilities. If a high severity finding remains, do not open the OAuth authorization URL; report the package and safe remediation boundary.

- [ ] **Step 4: Run verification before any X activation**

Run:

```bash
npm test -- tests/brain/import/local-creator-archive.test.ts tests/brain/import/x-owned-posts-client.test.ts tests/brain/import/x-oauth-pkce.test.ts tests/brain/import/x-owned-posts-cli.test.ts tests/brain/interfaces/mcp-server.test.ts tests/brain/interfaces/synthetic-mcp.test.ts tests/brain/interfaces/local-mcp.test.ts
npm run test:brain
npm run build
npm test
```

Expected: all commands pass. Verify `git diff --check`, confirm no archive/token file is tracked, and confirm `npm --silent run brain:mcp:local </dev/null` starts and exits without a network call.

- [ ] **Step 5: Refresh the runbook**

Add a short "Owned X history import" section to `docs/social-brain/slice-1-runbook.md` that states the OAuth client ID is configured outside Git, the user must approve the X screen, the command is one-time and read-only, the fixed request cap is 25/$0.05, and the plugin continues to deny all live capabilities afterward.
