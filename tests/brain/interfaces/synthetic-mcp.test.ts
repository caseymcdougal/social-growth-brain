import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import packageJson from "../../../package.json";
import { createSyntheticMcpServer } from "../../../src/brain/interfaces/mcp/synthetic-stdio";

const demoOpportunities = [
  { id: "20000000-0000-4000-8000-000000000001", actionType: "reply" },
  { id: "20000000-0000-4000-8000-000000000002", actionType: "quote" },
  { id: "20000000-0000-4000-8000-000000000003", actionType: "original" }
] as const;

describe("synthetic fixture MCP server", () => {
  it("serves three synthetic demo scenarios without PostgreSQL or live capabilities", async () => {
    const client = new Client({ name: "social-brain-synthetic-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = await createSyntheticMcpServer();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
        "explain_prediction",
        "get_creator_archive",
        "get_creator_baseline",
        "get_proof_status",
        "get_system_health",
        "inspect_opportunity",
        "list_opportunities"
      ]);

      const health = (await client.callTool({ name: "get_system_health", arguments: {} })).structuredContent as {
        mode: string;
        storage: string;
        creatorArchive: { available: boolean; source: string | null; importedAt: string | null };
        capabilities: Array<{ allowed: boolean }>;
      };
      expect(health.mode).toBe("synthetic");
      expect(health.storage).toBe("healthy");
      expect(health.creatorArchive).toEqual({ available: false, source: null, importedAt: null });
      expect(health.capabilities.every(({ allowed }) => !allowed)).toBe(true);

      const archive = (await client.callTool({ name: "get_creator_archive", arguments: {} })).structuredContent as {
        available: boolean;
        archive: unknown;
      };
      expect(archive).toEqual({ available: false, archive: null });

      expect((await client.callTool({ name: "get_creator_baseline", arguments: {} })).structuredContent).toEqual({
        proposalAvailable: false,
        acceptedAvailable: false,
        proposalMatchesCurrentArchive: false,
        acceptedMatchesCurrentArchive: false,
        proposal: null,
        accepted: null
      });

      const listed = (await client.callTool({ name: "list_opportunities", arguments: {} })).structuredContent as {
        opportunities: Array<{ id: string; actionType: string }>;
      };
      expect(listed.opportunities.map(({ id, actionType }) => ({ id, actionType }))).toEqual(demoOpportunities);

      for (const { id } of demoOpportunities) {
        const inspected = (await client.callTool({ name: "inspect_opportunity", arguments: { id } })).structuredContent as {
          evidence: unknown[];
          drafts: Array<{ content: string }>;
        };
        expect(inspected.evidence.length).toBeGreaterThanOrEqual(2);
        expect(inspected.drafts).toHaveLength(1);
        expect(inspected.drafts[0]?.content).toContain("Synthetic demo draft:");
      }
    } finally {
      await client.close();
    }
  });

  it("registers the synthetic stdio launcher", () => {
    expect(packageJson.scripts["brain:mcp:synthetic"]).toBe("tsx src/brain/interfaces/mcp/synthetic-stdio.ts");
  });
});
