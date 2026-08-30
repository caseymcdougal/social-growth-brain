import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadRuntimeConfig } from "../../config/runtime-config";
import { BrainQueryService } from "../../query/brain-query-service";
import { runMigrations } from "../../storage/migrations";
import { PostgresBrainEventStore } from "../../storage/postgres-event-store";
import { createPostgresPool } from "../../storage/postgres";
import { createReadOnlyMcpServer } from "./create-server";

const config = loadRuntimeConfig();
const pool = createPostgresPool(config.databaseUrl);
try {
  await runMigrations(pool);
  await createReadOnlyMcpServer(new BrainQueryService(new PostgresBrainEventStore(pool), config)).connect(new StdioServerTransport());
  console.error("Social Brain read-only MCP server running on stdio");
} catch (error) {
  await pool.end();
  throw error;
}
