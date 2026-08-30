import { lstatSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "../config/runtime-config";
import { createPostgresPool } from "../storage/postgres";
import { runMigrations } from "../storage/migrations";
import { PostgresBrainEventStore } from "../storage/postgres-event-store";
import { captureLegacyCreatorArchive, persistLegacyCreatorArchive } from "./import-legacy";

export function parseLegacyImportArgs(args: string[]): string {
  if (args.length !== 2 || args[0] !== "--sqlite" || !args[1]) throw new Error("Usage: --sqlite /absolute/path/to/file.sqlite");
  if (!isAbsolute(args[1])) throw new Error("--sqlite must be an absolute path");
  const sqlitePath = resolve(args[1]);
  let stats: ReturnType<typeof lstatSync>;
  try { stats = lstatSync(sqlitePath); } catch { throw new Error("--sqlite path does not exist"); }
  if (stats.isSymbolicLink()) throw new Error("--sqlite path must not be a symlink");
  if (!stats.isFile()) throw new Error("--sqlite path must be a file");
  return sqlitePath;
}

export async function runLegacyImportCli(args = process.argv.slice(2)): Promise<void> {
  const sqlitePath = parseLegacyImportArgs(args);
  const candidate = captureLegacyCreatorArchive(sqlitePath);
  const config = loadRuntimeConfig();
  const pool = createPostgresPool(config.databaseUrl);
  try {
    await runMigrations(pool);
    const result = await persistLegacyCreatorArchive(new PostgresBrainEventStore(pool), candidate);
    process.stdout.write(`${result.status}\n${result.archiveId}\n${result.sourceFingerprint}\n${result.importedPosts}\n`);
  } finally { await pool.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLegacyImportCli().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
