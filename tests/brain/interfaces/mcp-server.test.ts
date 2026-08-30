import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { BrainQueryService } from "../../../src/brain/query/brain-query-service";
import { createReadOnlyMcpServer } from "../../../src/brain/interfaces/mcp/create-server";
import type { BrainEventStore } from "../../../src/brain/storage/event-store";

const id = "20000000-0000-4000-8000-000000000001";

describe("read-only MCP server", () => {
  it("registers only the five approved inspection tools", async () => {
    const store = { healthCheck: async () => {}, listComplianceChecks: async () => [], listOpportunities: async () => [], getOpportunity: async () => null } as unknown as BrainEventStore;
    const service = new BrainQueryService(store, { mode: "synthetic", databaseUrl: "postgresql://social_brain:placeholder@127.0.0.1/social_brain_test" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createReadOnlyMcpServer(service);
    const client = new Client({ name: "social-brain-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual(["explain_prediction", "get_proof_status", "get_system_health", "inspect_opportunity", "list_opportunities"]);
      await expect(client.callTool({ name: "inspect_opportunity", arguments: { id } })).resolves.toMatchObject({ isError: true });
    } finally { await client.close(); }
  });
});
