import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { acceptedCreatorBaselineSchema, complianceCheckSchema, creatorArchiveSchema, creatorArchiveSourceSchema, creatorBaselineProposalSchema, decisionEventSchema, draftVariantSchema, opportunitySchema, opportunityStatusSchema, outcomeSnapshotSchema, signalEvidenceSchema, uuidSchema } from "../../domain";
import type { BrainQueryService } from "../../query/brain-query-service";

const opportunityListOutputSchema = z.object({ opportunities: z.array(opportunitySchema) });
const inspectionOutputSchema = z.object({ opportunity: opportunitySchema, revisions: z.array(opportunitySchema), evidence: z.array(signalEvidenceSchema), drafts: z.array(draftVariantSchema), decisions: z.array(decisionEventSchema), outcomes: z.array(outcomeSnapshotSchema), compliance: z.array(complianceCheckSchema) });
const explanationOutputSchema = z.object({ opportunity: opportunitySchema, evidence: z.array(signalEvidenceSchema), drafts: z.array(draftVariantSchema) });
const proofOutputSchema = z.object({ state: z.literal("not_started"), requiredConsecutiveDays: z.literal(7), requiredViews: z.literal(1000), maturityHours: z.literal(48), reason: z.string() });
const archiveOutputSchema = z.object({ available: z.boolean(), archive: creatorArchiveSchema.nullable() }).strict();
const baselineOutputSchema = z.object({ proposalAvailable: z.boolean(), acceptedAvailable: z.boolean(), proposalMatchesCurrentArchive: z.boolean(), acceptedMatchesCurrentArchive: z.boolean(), proposal: creatorBaselineProposalSchema.nullable(), accepted: acceptedCreatorBaselineSchema.nullable() }).strict();
const healthOutputSchema = z.object({ mode: z.enum(["synthetic", "production"]), storage: z.enum(["healthy", "unavailable"]), liveAdaptersInstalled: z.boolean(), approvalConfigured: z.boolean(), latestComplianceCheckedAt: z.string().datetime({ offset: true }).nullable(), creatorArchive: z.object({ available: z.boolean(), source: creatorArchiveSourceSchema.nullable(), importedAt: z.string().datetime({ offset: true }).nullable() }).strict(), capabilities: z.array(z.object({ capability: z.enum(["live-x-read", "live-ai-judgment", "live-ai-generation", "x-write"]), allowed: z.boolean(), reason: z.string() })) });

function structuredResult<T extends Record<string, unknown>>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.parse(value);
  return { content: [{ type: "text" as const, text: JSON.stringify(parsed, null, 2) }], structuredContent: parsed };
}

export function createReadOnlyMcpServer(queryService: BrainQueryService): McpServer {
  const server = new McpServer({ name: "social-brain", version: "1.0.0" });
  server.registerTool("list_opportunities", { description: "List current Social Brain Opportunity projections. Slice 1 is read-only.", inputSchema: { statuses: z.array(opportunityStatusSchema).optional(), limit: z.number().int().min(1).max(100).optional() }, outputSchema: opportunityListOutputSchema.shape }, async (input) => structuredResult(opportunityListOutputSchema, await queryService.listOpportunities(input)));
  server.registerTool("inspect_opportunity", { description: "Inspect one Opportunity and all stored evidence and history. Slice 1 is read-only.", inputSchema: { id: uuidSchema }, outputSchema: inspectionOutputSchema.shape }, async ({ id }) => structuredResult(inspectionOutputSchema, await queryService.inspectOpportunity(id)));
  server.registerTool("explain_prediction", { description: "Explain one immutable prediction revision from its evidence and drafts. Slice 1 is read-only.", inputSchema: { id: uuidSchema, revision: z.number().int().positive().optional() }, outputSchema: explanationOutputSchema.shape }, async ({ id, revision }) => structuredResult(explanationOutputSchema, await queryService.explainPrediction(id, revision)));
  server.registerTool("get_proof_status", { description: "Return the phase-one proof state. Slice 1 cannot start live proof.", inputSchema: {}, outputSchema: proofOutputSchema.shape }, async () => structuredResult(proofOutputSchema, queryService.getProofStatus()));
  server.registerTool("get_creator_archive", { description: "Return the locally imported, read-only owned-post archive when available.", inputSchema: {}, outputSchema: archiveOutputSchema.shape }, async () => {
    const archive = await queryService.getCreatorArchive();
    return structuredResult(archiveOutputSchema, { available: archive !== null, archive });
  });
  server.registerTool("get_creator_baseline", { description: "Inspect local proposal and accepted creator-baseline state. This read-only tool never generates or accepts anything.", inputSchema: {}, outputSchema: baselineOutputSchema.shape }, async () => structuredResult(baselineOutputSchema, queryService.getCreatorBaseline()));
  server.registerTool("get_system_health", { description: "Return storage and policy-gate health without secrets. Slice 1 is read-only.", inputSchema: {}, outputSchema: healthOutputSchema.shape }, async () => structuredResult(healthOutputSchema, await queryService.getSystemHealth()));
  return server;
}
