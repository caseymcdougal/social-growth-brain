import { loadRuntimeConfig } from "../config/runtime-config";
import { runMigrations } from "./migrations";
import { createPostgresPool } from "./postgres";

const config = loadRuntimeConfig();
const pool = createPostgresPool(config.databaseUrl);

try {
  await runMigrations(pool);
  process.stdout.write("Social Brain migrations applied.\n");
} finally {
  await pool.end();
}
