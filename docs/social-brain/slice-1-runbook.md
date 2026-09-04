# Social Brain Slice 1 Runbook

## Policy boundary

Slice 1 accepts synthetic fixtures and Casey-owned legacy data only. It must not access live X, run models on X content, use Telegram, or publish. Keep `SOCIAL_BRAIN_MODE` at its safe synthetic default.

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

Launch the local read-only MCP from the repository root and configure the client to launch the same command. It always serves the three synthetic scenarios and optionally exposes a valid private owned-post archive. The silent flag is required because stdout is the MCP protocol stream.

```bash
npm --silent run brain:mcp:local
```

## Owned X history import

This is a one-time, read-only import of up to 25 of Casey's own original X posts. It is not a live feed, a scheduled refresh, AI processing, or a publishing integration.

1. In the X Developer Portal, configure the exact OAuth callback `http://127.0.0.1:8787/callback` and obtain the public OAuth client ID. Keep it outside Git by adding it to the ignored `.env` file as `SOCIAL_BRAIN_X_OAUTH_CLIENT_ID=...`.
2. Run `npm run brain:import:x-owned`. The command displays a fixed $0.05 request envelope before it opens an authorization URL.
3. Casey manually reviews and approves only `tweet.read` and `users.read` on the X consent screen. The access token stays in process memory and is never saved.
4. The command makes one authenticated-profile request and one 25-post page request, then writes the private mode-`0600` archive at `data/social-brain/casey-owned-post-history.json`.

The X Developer Console spend limit is the final cost control. After import, the local plugin can only inspect the archive with `get_creator_archive`; it still cannot refresh X data, use AI on the archive, or publish.

## Failure recovery

If the database is unavailable, no state transition occurs; restore database availability and rerun the startup commands. Duplicate synthetic seeds are safe and leave the canonical fixture intact. Production configuration parsing fails closed when approval or either budget is missing, blank, or invalid.
