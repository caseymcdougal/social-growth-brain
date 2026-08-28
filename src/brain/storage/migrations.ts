import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";

const migrations = [{
  version: 1,
  name: "brain_foundation",
  url: new URL("./migrations/0001_brain_foundation.sql", pathToFileURL(`${process.cwd()}/src/brain/storage/`))
}];

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('social-brain-migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS brain_schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const applied = await client.query<{ version: number }>("SELECT version FROM brain_schema_migrations");
    const appliedVersions = new Set(applied.rows.map((row) => row.version));
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      await client.query(await readFile(migration.url, "utf8"));
      await client.query("INSERT INTO brain_schema_migrations (version, name) VALUES ($1, $2)", [migration.version, migration.name]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
