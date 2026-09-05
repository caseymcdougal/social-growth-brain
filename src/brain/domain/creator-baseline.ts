import { randomUUID } from "node:crypto";
import { z } from "zod";
import { strategyMemorySchema } from "../../shared/strategy-intelligence-schema";
import { voiceProfileSchema } from "../../shared/voice-profile";
import {
  CASEY_CREATOR_ID,
  isoTimestampSchema,
  SOCIAL_BRAIN_SCHEMA_VERSION,
  uuidSchema,
  xPostIdSchema
} from "./common";
import { creatorArchiveSchema, type CreatorArchive } from "./creator-archive";

const requiredText = z.string().trim().min(1);
const sourceFingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const baselineClaimAreaSchema = z.enum([
  "voice",
  "positioning",
  "audience",
  "strongest-lane",
  "weak-lane",
  "proof-point",
  "experiment",
  "duplication"
]);

export type BaselineClaimArea = z.infer<typeof baselineClaimAreaSchema>;

export const baselineClaimSchema = z.object({
  area: baselineClaimAreaSchema,
  claim: requiredText,
  postIds: z.array(xPostIdSchema).min(1),
  evidenceKind: z.enum(["measured", "inferred"]),
  confidence: z.number().min(0).max(1),
  uncertainty: requiredText
}).strict();

type BaselineContent = {
  duplicationGuard: { consideredPostIds: string[] };
  claims: Array<{
    area: BaselineClaimArea;
    postIds: string[];
    evidenceKind: "measured" | "inferred";
  }>;
};

type BaselineContentIssue = {
  path: Array<string | number>;
  message: string;
};

const MEASURED_AREAS = new Set<BaselineClaimArea>(["voice", "duplication"]);
const STRATEGY_AREAS = new Set<BaselineClaimArea>([
  "positioning",
  "audience",
  "strongest-lane",
  "weak-lane",
  "proof-point",
  "experiment"
]);

function findBaselineContentIssues(value: BaselineContent): BaselineContentIssue[] {
  const issues: BaselineContentIssue[] = [];
  const consideredPostIds = value.duplicationGuard.consideredPostIds;
  if (new Set(consideredPostIds).size !== consideredPostIds.length) {
    issues.push({
      path: ["duplicationGuard", "consideredPostIds"],
      message: "Considered post IDs must be unique"
    });
  }

  value.claims.forEach((claim, index) => {
    if (new Set(claim.postIds).size !== claim.postIds.length) {
      issues.push({ path: ["claims", index, "postIds"], message: "Claim post IDs must be unique" });
    }
    const expectedEvidenceKind = MEASURED_AREAS.has(claim.area) ? "measured" : "inferred";
    if (claim.evidenceKind !== expectedEvidenceKind) {
      issues.push({
        path: ["claims", index, "evidenceKind"],
        message: `Evidence kind for ${claim.area} must be ${expectedEvidenceKind}`
      });
    }
  });

  if (!value.claims.some(({ area }) => area === "voice")) {
    issues.push({ path: ["claims"], message: "Baseline claims must include voice evidence" });
  }
  if (!value.claims.some(({ area }) => STRATEGY_AREAS.has(area))) {
    issues.push({ path: ["claims"], message: "Baseline claims must include strategy evidence" });
  }
  return issues;
}

function addBaselineContentIssues(value: BaselineContent, context: z.core.$RefinementCtx<BaselineContent>): void {
  for (const issue of findBaselineContentIssues(value)) {
    context.addIssue({ code: "custom", ...issue });
  }
}

export const creatorBaselineModelOutputSchema = z.object({
  voiceProfile: voiceProfileSchema,
  strategyMemory: strategyMemorySchema,
  duplicationGuard: z.object({
    consideredPostIds: z.array(xPostIdSchema).min(1)
  }).strict(),
  claims: z.array(baselineClaimSchema).min(2),
  largestUncertainty: requiredText
}).strict().superRefine(addBaselineContentIssues);

export const creatorBaselineProposalSchema = z.object({
  schemaVersion: z.literal(SOCIAL_BRAIN_SCHEMA_VERSION),
  id: uuidSchema,
  creatorId: z.literal(CASEY_CREATOR_ID),
  createdAt: isoTimestampSchema,
  sourceArchiveFingerprint: sourceFingerprintSchema,
  provenance: z.object({
    interface: z.literal("codex-cli"),
    model: z.literal("codex-cli-chatgpt-default"),
    promptTemplateVersion: z.literal("owned-x-baseline-v1")
  }).strict(),
  voiceProfile: voiceProfileSchema,
  strategyMemory: strategyMemorySchema,
  duplicationGuard: z.object({
    consideredPostIds: z.array(xPostIdSchema).min(1)
  }).strict(),
  claims: z.array(baselineClaimSchema).min(2),
  largestUncertainty: requiredText
}).strict().superRefine(addBaselineContentIssues);

export const acceptedCreatorBaselineSchema = z.object({
  schemaVersion: z.literal(SOCIAL_BRAIN_SCHEMA_VERSION),
  proposal: creatorBaselineProposalSchema,
  acceptedAt: isoTimestampSchema,
  acceptedBy: z.literal(CASEY_CREATOR_ID),
  acceptedProposalId: uuidSchema,
  acceptedSourceArchiveFingerprint: sourceFingerprintSchema
}).strict().superRefine((value, context) => {
  if (value.acceptedProposalId !== value.proposal.id) {
    context.addIssue({
      code: "custom",
      path: ["acceptedProposalId"],
      message: "Accepted proposal ID must match the nested proposal"
    });
  }
  if (value.acceptedSourceArchiveFingerprint !== value.proposal.sourceArchiveFingerprint) {
    context.addIssue({
      code: "custom",
      path: ["acceptedSourceArchiveFingerprint"],
      message: "Accepted source fingerprint must match the nested proposal"
    });
  }
});

export type BaselineClaim = z.infer<typeof baselineClaimSchema>;
export type CreatorBaselineModelOutput = z.infer<typeof creatorBaselineModelOutputSchema>;
export type CreatorBaselineProposal = z.infer<typeof creatorBaselineProposalSchema>;
export type AcceptedCreatorBaseline = z.infer<typeof acceptedCreatorBaselineSchema>;

function validateModelOutputAgainstArchive(
  archive: CreatorArchive,
  modelOutput: CreatorBaselineModelOutput
): void {
  const archivePostIds = archive.posts.map(({ xPostId }) => xPostId);
  const archivePostIdSet = new Set(archivePostIds);
  const consideredPostIds = modelOutput.duplicationGuard.consideredPostIds;
  const consideredPostIdSet = new Set(consideredPostIds);

  if (
    consideredPostIds.length !== archivePostIds.length ||
    consideredPostIdSet.size !== consideredPostIds.length ||
    archivePostIds.some((postId) => !consideredPostIdSet.has(postId))
  ) {
    throw new Error("Considered post IDs must contain every archive post exactly once");
  }

  for (const claim of modelOutput.claims) {
    if (new Set(claim.postIds).size !== claim.postIds.length) {
      throw new Error("Claim post IDs must be unique");
    }
    if (claim.postIds.some((postId) => !archivePostIdSet.has(postId))) {
      throw new Error("Claim references an unknown post ID");
    }

    const expectedEvidenceKind = MEASURED_AREAS.has(claim.area) ? "measured" : "inferred";
    if (claim.evidenceKind !== expectedEvidenceKind) {
      throw new Error(`Evidence kind for ${claim.area} must be ${expectedEvidenceKind}`);
    }
  }

  if (!modelOutput.claims.some(({ area }) => area === "voice")) {
    throw new Error("Baseline claims must include voice evidence");
  }
  if (!modelOutput.claims.some(({ area }) => STRATEGY_AREAS.has(area))) {
    throw new Error("Baseline claims must include strategy evidence");
  }
}

function validateOwnedArchive(input: CreatorArchive): CreatorArchive {
  const archive = creatorArchiveSchema.parse(input);
  if (archive.source !== "x-api-owned-posts") {
    throw new Error("Creator baseline requires an owned X archive");
  }
  if (archive.posts.length === 0) {
    throw new Error("Owned X archive must contain at least one post");
  }
  return archive;
}

function validateProposalAgainstArchive(
  archive: CreatorArchive,
  input: CreatorBaselineProposal
): CreatorBaselineProposal {
  const proposal = creatorBaselineProposalSchema.parse(input);
  if (proposal.sourceArchiveFingerprint !== archive.sourceFingerprint) {
    throw new Error("Proposal source fingerprint does not match the current archive");
  }
  validateModelOutputAgainstArchive(archive, proposal);
  return proposal;
}

export function buildCreatorBaselineProposal(input: {
  archive: CreatorArchive;
  modelOutput: CreatorBaselineModelOutput;
  id?: string;
  now?: () => Date;
}): CreatorBaselineProposal {
  const archive = validateOwnedArchive(input.archive);
  const modelOutput = creatorBaselineModelOutputSchema.parse(input.modelOutput);
  validateModelOutputAgainstArchive(archive, modelOutput);

  return creatorBaselineProposalSchema.parse({
    schemaVersion: SOCIAL_BRAIN_SCHEMA_VERSION,
    id: input.id ?? randomUUID(),
    creatorId: CASEY_CREATOR_ID,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
    sourceArchiveFingerprint: archive.sourceFingerprint,
    provenance: {
      interface: "codex-cli",
      model: "codex-cli-chatgpt-default",
      promptTemplateVersion: "owned-x-baseline-v1"
    },
    ...structuredClone(modelOutput)
  });
}

export function acceptCreatorBaseline(input: {
  archive: CreatorArchive;
  proposal: CreatorBaselineProposal;
  proposalId: string;
  sourceFingerprint: string;
  now?: () => Date;
}): AcceptedCreatorBaseline {
  const archive = validateOwnedArchive(input.archive);
  const proposal = validateProposalAgainstArchive(archive, input.proposal);

  if (input.proposalId !== proposal.id) {
    throw new Error("Approved proposal ID does not match the current proposal");
  }
  if (input.sourceFingerprint !== proposal.sourceArchiveFingerprint) {
    throw new Error("Approved source fingerprint does not match the current proposal");
  }

  return acceptedCreatorBaselineSchema.parse({
    schemaVersion: SOCIAL_BRAIN_SCHEMA_VERSION,
    proposal: structuredClone(proposal),
    acceptedAt: (input.now ?? (() => new Date()))().toISOString(),
    acceptedBy: CASEY_CREATOR_ID,
    acceptedProposalId: proposal.id,
    acceptedSourceArchiveFingerprint: proposal.sourceArchiveFingerprint
  });
}
