import { z } from "zod";
import {
  actionTypeSchema,
  CASEY_CREATOR_ID,
  isoTimestampSchema,
  SOCIAL_BRAIN_SCHEMA_VERSION,
  uuidSchema,
  xPostIdSchema
} from "./common";

const featureValueSchema = z.union([z.number(), z.string(), z.boolean(), z.null()]);

export const featureEvidenceSchema = z.object({
  name: z.string().trim().min(1),
  rawValue: featureValueSchema,
  normalizedValue: z.number().nullable(),
  normalizationMethod: z.string().trim().min(1),
  baselineId: z.string().trim().min(1).nullable(),
  observedAt: isoTimestampSchema,
  featureCodeVersion: z.string().trim().min(1)
});

export const signalEvidenceSchema = z.object({
  schemaVersion: z.literal(SOCIAL_BRAIN_SCHEMA_VERSION),
  id: uuidSchema,
  opportunityId: uuidSchema,
  predictionRevision: z.number().int().positive(),
  creatorId: z.literal(CASEY_CREATOR_ID),
  source: z.enum(["synthetic", "casey-owned-archive", "official-x-api"]),
  retainedPostId: xPostIdSchema.nullable(),
  capturedAt: isoTimestampSchema,
  features: z.array(featureEvidenceSchema).min(1)
});

export const draftVariantSchema = z
  .object({
    schemaVersion: z.literal(SOCIAL_BRAIN_SCHEMA_VERSION),
    id: uuidSchema,
    opportunityId: uuidSchema,
    predictionRevision: z.number().int().positive(),
    actionType: actionTypeSchema,
    targetPostId: xPostIdSchema.nullable(),
    content: z.string().trim().min(1),
    angle: z.string().trim().min(1),
    voiceProfileVersion: z.string().trim().min(1),
    modelId: z.string().trim().min(1),
    promptTemplateVersion: z.string().trim().min(1),
    qualityScore: z.number().min(0).max(1),
    noveltyScore: z.number().min(0).max(1),
    createdAt: isoTimestampSchema
  })
  .superRefine((value, context) => {
    if (value.actionType === "original" && value.targetPostId !== null) {
      context.addIssue({ code: "custom", path: ["targetPostId"], message: "original drafts cannot target a Post" });
    }
    if (value.actionType !== "original" && value.targetPostId === null) {
      context.addIssue({ code: "custom", path: ["targetPostId"], message: "reply and quote drafts require a target" });
    }
  });

export const decisionEventTypeSchema = z.enum([
  "detected",
  "surfaced",
  "approved",
  "revised",
  "rejected",
  "expired",
  "publishing",
  "published",
  "publish_uncertain",
  "failed",
  "measuring",
  "matured"
]);

export const decisionEventSchema = z.object({
  schemaVersion: z.literal(SOCIAL_BRAIN_SCHEMA_VERSION),
  id: uuidSchema,
  opportunityId: uuidSchema,
  opportunityRevision: z.number().int().positive(),
  type: decisionEventTypeSchema,
  actor: z.object({ type: z.enum(["system", "human"]), id: z.string().trim().min(1) }),
  interface: z.enum(["replay", "mcp", "telegram", "system"]),
  occurredAt: isoTimestampSchema,
  payload: z.record(z.string(), z.unknown())
});

export const outcomeSnapshotSchema = z.object({
  schemaVersion: z.literal(SOCIAL_BRAIN_SCHEMA_VERSION),
  id: uuidSchema,
  opportunityId: uuidSchema,
  publishedPostId: xPostIdSchema,
  publishedAt: isoTimestampSchema,
  observedAt: isoTimestampSchema,
  observationAgeMinutes: z.number().int().nonnegative(),
  publicMetrics: z.object({
    views: z.number().int().nonnegative().nullable(),
    likes: z.number().int().nonnegative().nullable(),
    replies: z.number().int().nonnegative().nullable(),
    reposts: z.number().int().nonnegative().nullable(),
    bookmarks: z.number().int().nonnegative().nullable()
  }),
  privateMetrics: z.record(z.string(), z.number().nonnegative()).nullable(),
  source: z.enum(["synthetic", "official-x-api"]),
  collectionStatus: z.enum(["complete", "partial", "unavailable"])
});

export const complianceCheckSchema = z.object({
  schemaVersion: z.literal(SOCIAL_BRAIN_SCHEMA_VERSION),
  id: uuidSchema,
  retainedPostId: xPostIdSchema,
  checkedAt: isoTimestampSchema,
  nextCheckAt: isoTimestampSchema,
  status: z.enum(["active", "deleted", "edited", "protected", "withheld", "suspended"]),
  requiredAction: z.enum(["retain", "rehydrate", "purge"]),
  source: z.enum(["synthetic", "x-batch-compliance", "direct-removal-notice"])
});

export type SignalEvidence = z.infer<typeof signalEvidenceSchema>;
export type DraftVariant = z.infer<typeof draftVariantSchema>;
export type DecisionEvent = z.infer<typeof decisionEventSchema>;
export type OutcomeSnapshot = z.infer<typeof outcomeSnapshotSchema>;
export type ComplianceCheck = z.infer<typeof complianceCheckSchema>;
