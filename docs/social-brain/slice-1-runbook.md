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

Launch MCP from the repository root and configure the client to launch the same command. The silent flag is required because stdout is the MCP protocol stream.

```bash
npm --silent run brain:mcp
```

## Failure recovery

If the database is unavailable, no state transition occurs; restore database availability and rerun the startup commands. Duplicate synthetic seeds are safe and leave the canonical fixture intact. Production configuration parsing fails closed when approval or either budget is missing, blank, or invalid.
