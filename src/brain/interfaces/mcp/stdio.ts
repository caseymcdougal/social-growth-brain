import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { EventEmitter } from "node:events";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadRuntimeConfig } from "../../config/runtime-config";
import { BrainQueryService } from "../../query/brain-query-service";
import { runMigrations } from "../../storage/migrations";
import { PostgresBrainEventStore } from "../../storage/postgres-event-store";
import { createPostgresPool } from "../../storage/postgres";
import { createReadOnlyMcpServer } from "./create-server";

type StdioLifecycleDependencies = {
  stdin: Pick<EventEmitter, "once" | "off">;
  transport: { close(): Promise<void> };
  server: { connect(transport: unknown): Promise<void>; close(): Promise<void> };
  pool: { end(): Promise<void> };
  migrate(pool: unknown): Promise<void>;
  logError(message: string, error: unknown): void;
};

export async function runReadOnlyStdioServer(dependencies: StdioLifecycleDependencies): Promise<"closed" | "error"> {
  let inputError: unknown = null;
  let resolveShutdown!: () => void;
  const shutdown = new Promise<void>((resolveShutdownPromise) => { resolveShutdown = resolveShutdownPromise; });
  const onEnd = () => resolveShutdown();
  const onError = (error: unknown) => {
    inputError = error;
    dependencies.logError("Social Brain MCP stdin error", error);
    resolveShutdown();
  };
  dependencies.stdin.once("end", onEnd);
  dependencies.stdin.once("error", onError);
  try {
    await dependencies.migrate(dependencies.pool);
    await dependencies.server.connect(dependencies.transport);
    await shutdown;
    return inputError === null ? "closed" : "error";
  } finally {
    dependencies.stdin.off("end", onEnd);
    dependencies.stdin.off("error", onError);
    try {
      await dependencies.server.close();
    } finally {
      await dependencies.pool.end();
    }
  }
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const pool = createPostgresPool(config.databaseUrl);
  const server = createReadOnlyMcpServer(new BrainQueryService(new PostgresBrainEventStore(pool), config));
  const result = await runReadOnlyStdioServer({ stdin: process.stdin, transport: new StdioServerTransport(), server, pool, migrate: runMigrations, logError: console.error });
  if (result === "error") process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
