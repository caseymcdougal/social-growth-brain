import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLocalMcpServer } from "./local-server";
import { runReadOnlyStdioServer } from "./stdio";

export async function createSyntheticMcpServer() {
  return createLocalMcpServer({ archivePath: null });
}

async function main(): Promise<void> {
  const server = await createSyntheticMcpServer();
  const result = await runReadOnlyStdioServer({
    stdin: process.stdin,
    transport: new StdioServerTransport(),
    server,
    pool: { end: async () => {} },
    migrate: async () => {},
    logError: console.error
  });
  if (result === "error") process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
