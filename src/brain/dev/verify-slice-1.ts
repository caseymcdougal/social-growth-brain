import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadRuntimeConfig } from "../config/runtime-config";
import { createReadOnlyMcpServer } from "../interfaces/mcp/create-server";
import { BrainQueryService } from "../query/brain-query-service";
import { runMigrations } from "../storage/migrations";
import { PostgresBrainEventStore } from "../storage/postgres-event-store";
import { createPostgresPool } from "../storage/postgres";

const expectedTools = ["explain_prediction", "get_creator_archive", "get_creator_baseline", "get_proof_status", "get_system_health", "inspect_opportunity", "list_opportunities"];
const expectedOpportunityId = "20000000-0000-4000-8000-000000000001";
const expectedEvidenceCount = 3;
const expectedCapabilities = ["live-x-read", "live-ai-judgment", "live-ai-generation", "x-write"];
const expectedLatestComplianceCheckedAt = "2026-08-27T14:07:00.000Z";

type VerificationInput = {
  tools: string[];
  inspection: { opportunity: { id: string; revision: number }; evidence: unknown[] } | undefined;
  baseline: { proposalAvailable: boolean; acceptedAvailable: boolean; proposalMatchesCurrentArchive: boolean; acceptedMatchesCurrentArchive: boolean } | undefined;
  health: { mode: string; storage: string; liveAdaptersInstalled: boolean; approvalConfigured: boolean; latestComplianceCheckedAt: string | null; creatorArchive: { available: boolean; source: string | null; importedAt: string | null }; capabilities: { capability: string; allowed: boolean; reason: string }[] } | undefined;
};

export function validateSlice1Verification(input: VerificationInput): asserts input is VerificationInput & { inspection: NonNullable<VerificationInput["inspection"]>; health: NonNullable<VerificationInput["health"]> } {
  const { tools, inspection, baseline, health } = input;
  if (JSON.stringify(tools) !== JSON.stringify(expectedTools)) throw new Error("Unexpected MCP tool registry");
  if (!inspection || inspection.opportunity.id !== expectedOpportunityId || inspection.opportunity.revision !== 1 || inspection.evidence.length !== expectedEvidenceCount) throw new Error("Seeded MCP inspection invariants failed");
  if (!baseline || baseline.proposalAvailable || baseline.acceptedAvailable || baseline.proposalMatchesCurrentArchive || baseline.acceptedMatchesCurrentArchive) throw new Error("Unexpected creator baseline state");
  if (!health || health.mode !== "synthetic" || health.storage !== "healthy" || health.liveAdaptersInstalled || health.approvalConfigured || health.latestComplianceCheckedAt !== expectedLatestComplianceCheckedAt || health.creatorArchive.available || health.creatorArchive.source !== null || health.creatorArchive.importedAt !== null) throw new Error("Unexpected Slice 1 system health");
  if (health.capabilities.length !== expectedCapabilities.length || health.capabilities.some(({ capability, allowed, reason }, index) => capability !== expectedCapabilities[index] || allowed || reason !== "live capabilities are disabled in synthetic mode")) throw new Error("Live capability policy is not fail-closed");
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const pool = createPostgresPool(config.databaseUrl);
  const client = new Client({ name: "social-brain-verifier", version: "1.0.0" });
  try {
  await runMigrations(pool);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createReadOnlyMcpServer(new BrainQueryService(new PostgresBrainEventStore(pool), config));
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
  const inspection = (await client.callTool({ name: "inspect_opportunity", arguments: { id: expectedOpportunityId } })).structuredContent as { opportunity: { id: string; revision: number }; evidence: unknown[] } | undefined;
  const baseline = (await client.callTool({ name: "get_creator_baseline", arguments: {} })).structuredContent as VerificationInput["baseline"];
  const health = (await client.callTool({ name: "get_system_health", arguments: {} })).structuredContent as VerificationInput["health"];
  const verification = { tools, inspection, baseline, health };
  validateSlice1Verification(verification);
  process.stdout.write(`${JSON.stringify({ result: "passed", tools, opportunityId: verification.inspection.opportunity.id, revision: verification.inspection.opportunity.revision, evidenceCount: verification.inspection.evidence.length, mode: verification.health.mode, liveCapabilityDecisions: verification.health.capabilities })}\n`);
} finally {
    await client.close();
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
