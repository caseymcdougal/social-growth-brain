# Social Brain Slice 1 Runbook

## Policy boundary

Slice 1 accepts synthetic fixtures and Casey-owned data only. Its MCP server must not access live X, start a model, use Telegram, mutate a baseline, or publish. Keep `SOCIAL_BRAIN_MODE` at its safe synthetic default.

The separate baseline proposal command is the only approved model boundary. It runs only when Casey starts it explicitly, uses ChatGPT-authenticated Codex without direct API billing, and cannot publish or accept its own result.

## Local startup

The built-in synthetic database URL is safe for local use. To use the matching documented override, copy the synthetic values from `.env.example`; do not use production mode. Start PostgreSQL, apply migrations, seed the deterministic fixture, and run the gate from the repository root:

```bash
npm run brain:db:up
npm run brain:migrate
npm run brain:seed
npm run brain:verify:slice1
```

## Legacy import

Pass an absolute SQLite path. The importer is fixed to Casey-owned material: it filters to Casey and omits ambiguous global fields rather than importing them. The source database is read-only.

```bash
npm run brain:import:legacy -- --sqlite /absolute/path/to/file.sqlite
```

## Agent connection

Launch the local read-only MCP from the repository root and configure the client to launch the same command. It always serves the three synthetic scenarios and optionally exposes a valid private owned-post archive, baseline proposal, and accepted baseline. The silent flag is required because stdout is the MCP protocol stream.

```bash
npm --silent run brain:mcp:local
```

## Owned X history import

This is a one-time, read-only import of up to 25 of Casey's own original X posts. It is not a live feed, a scheduled refresh, AI processing, or a publishing integration.

1. In the X Developer Portal, configure the exact OAuth callback `http://127.0.0.1:8787/callback` and obtain the public OAuth client ID. Keep it outside Git by adding it to the ignored `.env` file as `SOCIAL_BRAIN_X_OAUTH_CLIENT_ID=...`.
2. Run `npm run brain:import:x-owned`. The command displays a fixed $0.05 request envelope before it opens an authorization URL.
3. Casey manually reviews and approves only `tweet.read` and `users.read` on the X consent screen. The access token stays in process memory and is never saved.
4. The command makes one authenticated-profile request and one 25-post page request, then writes the private mode-`0600` archive at `data/social-brain/casey-owned-post-history.json`.

The X Developer Console spend limit is the final cost control. After import, the local plugin can only inspect the archive with `get_creator_archive`; it still cannot refresh X data, start AI processing, or publish.

## Creator baseline proposal

This is a separate, explicit analysis of the already imported owned-X archive. It makes no X request, does not use `OPENAI_API_KEY`, has no Claude or provider fallback, and creates no schedule.

1. Run `codex login status` and confirm it prints exactly `Logged in using ChatGPT`.
2. Run `npm run brain:baseline:propose` from the repository root.
3. The command creates a unique mode-`0700` temporary directory outside the repository. It writes only the imported profile, post text, timestamps, post IDs, and public metrics into mode-`0600` job files.
4. Codex runs once with user configuration and MCP connectors disabled, a read-only sandbox, and a strict output schema. Post text is treated as untrusted evidence, never as instructions.
5. The entire temporary directory is deleted on success or failure. The raw archive must remain byte-identical.
6. A valid result is written atomically to the Git-ignored, mode-`0600` path `data/social-brain/casey-baseline-proposal.json`. The command prints only the proposal ID, source archive fingerprint, and claim count.

Proposal generation does not create or update `data/social-brain/casey-baseline.json`. Review the proposal through the read-only `get_creator_baseline` MCP tool, including measured versus inferred claims and the largest uncertainty.

## Explicit baseline acceptance

Acceptance is allowed only after Casey reviews and explicitly approves the exact displayed proposal. Run `npm run brain:baseline:accept` with the literal `--proposal-id` and `--source-fingerprint` values Casey approved. The command rejects missing, reordered, duplicated, malformed, or stale identifiers.

Successful acceptance atomically writes a complete snapshot to the Git-ignored, mode-`0600` path `data/social-brain/casey-baseline.json`. It does not change the proposal or raw archive. The MCP can inspect accepted state but cannot create, replace, or accept it.

## Failure recovery

If the database is unavailable, no state transition occurs; restore database availability and rerun the startup commands. Duplicate synthetic seeds are safe and leave the canonical fixture intact. Production configuration parsing fails closed when approval or either budget is missing, blank, or invalid.

If proposal generation fails, no proposal is written and any existing accepted baseline remains unchanged. Confirm ChatGPT authentication, archive availability, and archive validity before retrying. If acceptance fails, re-open `get_creator_baseline` and compare the currently displayed proposal ID and archive fingerprint with the values Casey approved; do not substitute a newer proposal automatically.
