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
}).strict();

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
}).strict();

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
  .strict()
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

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const machineCodeSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const decisionEventEnvelopeSchema = z
  .object({
  schemaVersion: z.literal(SOCIAL_BRAIN_SCHEMA_VERSION),
  id: uuidSchema,
  opportunityId: uuidSchema,
  opportunityRevision: z.number().int().positive(),
  actor: z.object({ type: z.enum(["system", "human"]), id: z.string().trim().min(1) }).strict(),
  interface: z.enum(["replay", "mcp", "telegram", "system"]),
  occurredAt: isoTimestampSchema
  })
  .strict();

export const decisionEventSchema = z.discriminatedUnion("type", [
  decisionEventEnvelopeSchema.extend({
    type: z.literal("detected"),
    payload: z.object({ pipelineRunId: uuidSchema }).strict()
  }).strict(),
  decisionEventEnvelopeSchema.extend({
    type: z.literal("surfaced"),
    payload: z.object({ deliveryId: uuidSchema.optional() }).strict()
  }).strict(),
  decisionEventEnvelopeSchema.extend({
    type: z.literal("approved"),
    payload: z.object({ draftId: uuidSchema, draftContentHash: sha256Schema, approvalExpiresAt: isoTimestampSchema }).strict()
  }).strict(),
  decisionEventEnvelopeSchema.extend({
    type: z.literal("revised"),
    payload: z
      .object({ previousDraftId: uuidSchema, draftId: uuidSchema, draftContentHash: sha256Schema })
      .strict()
  }).strict(),
  decisionEventEnvelopeSchema.extend({
    type: z.literal("rejected"),
    payload: z.object({ reasonCode: machineCodeSchema }).strict()
  }).strict(),
  decisionEventEnvelopeSchema.extend({
    type: z.literal("expired"),
    payload: z.object({ reasonCode: machineCodeSchema }).strict()
  }).strict(),
  decisionEventEnvelopeSchema.extend({
    type: z.literal("publishing"),
    payload: z
      .object({ publishIntentId: uuidSchema, draftContentHash: sha256Schema, idempotencyKeyHash: sha256Schema })
      .strict()
  }).strict(),
  decisionEventEnvelopeSchema.extend({
    type: z.literal("published"),
    payload: z.object({ publishIntentId: uuidSchema, publishedPostId: xPostIdSchema }).strict()
  }).strict(),
  decisionEventEnvelopeSchema.extend({
    type: z.literal("publish_uncertain"),
    payload: z.object({ publishIntentId: uuidSchema, reasonCode: machineCodeSchema }).strict()
  }).strict(),
  decisionEventEnvelopeSchema.extend({
    type: z.literal("failed"),
    payload: z.object({ publishIntentId: uuidSchema.nullable(), errorCode: machineCodeSchema, retryable: z.boolean() }).strict()
  }).strict(),
  decisionEventEnvelopeSchema.extend({
    type: z.literal("measuring"),
    payload: z.object({ publishedPostId: xPostIdSchema }).strict()
  }).strict(),
  decisionEventEnvelopeSchema.extend({
    type: z.literal("matured"),
    payload: z
      .object({ publishedPostId: xPostIdSchema, outcomeSnapshotId: uuidSchema, qualifiesForProof: z.boolean() })
      .strict()
  }).strict()
]).superRefine((value, context) => {
  if (value.type === "approved" && Date.parse(value.payload.approvalExpiresAt) <= Date.parse(value.occurredAt)) {
    context.addIssue({
      code: "custom",
      path: ["payload", "approvalExpiresAt"],
      message: "approvalExpiresAt must follow occurredAt"
    });
  }
});

export const outcomeSnapshotSchema = z
  .object({
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
    }).strict(),
    privateMetrics: z.record(z.string(), z.number().nonnegative()).nullable(),
    source: z.enum(["synthetic", "official-x-api"]),
    collectionStatus: z.enum(["complete", "partial", "unavailable"])
  })
  .strict()
  .superRefine((value, context) => {
    const publishedAt = Date.parse(value.publishedAt);
    const observedAt = Date.parse(value.observedAt);
    if (observedAt < publishedAt) {
      context.addIssue({ code: "custom", path: ["observedAt"], message: "observedAt cannot precede publishedAt" });
    }
    if (value.observationAgeMinutes !== Math.floor((observedAt - publishedAt) / 60_000)) {
      context.addIssue({
        code: "custom",
        path: ["observationAgeMinutes"],
        message: "observationAgeMinutes must match the observed publication interval"
      });
    }
  });

export const complianceCheckSchema = z
  .object({
    schemaVersion: z.literal(SOCIAL_BRAIN_SCHEMA_VERSION),
    id: uuidSchema,
    retainedPostId: xPostIdSchema,
    checkedAt: isoTimestampSchema,
    nextCheckAt: isoTimestampSchema,
    status: z.enum(["active", "deleted", "edited", "protected", "withheld", "suspended"]),
    requiredAction: z.enum(["retain", "rehydrate", "purge"]),
    source: z.enum(["synthetic", "x-batch-compliance", "direct-removal-notice"])
  })
  .strict()
  .superRefine((value, context) => {
    const checkedAt = Date.parse(value.checkedAt);
    const nextCheckAt = Date.parse(value.nextCheckAt);
    if (nextCheckAt <= checkedAt || nextCheckAt - checkedAt > 12 * 60 * 60 * 1000) {
      context.addIssue({ code: "custom", path: ["nextCheckAt"], message: "nextCheckAt must be within the next 12 hours" });
    }
    const requiredAction = value.status === "active" ? "retain" : value.status === "edited" ? "rehydrate" : "purge";
    if (value.requiredAction !== requiredAction) {
      context.addIssue({ code: "custom", path: ["requiredAction"], message: "requiredAction must match compliance status" });
    }
  });

export type SignalEvidence = z.infer<typeof signalEvidenceSchema>;
export type DraftVariant = z.infer<typeof draftVariantSchema>;
export type DecisionEvent = z.infer<typeof decisionEventSchema>;
export type OutcomeSnapshot = z.infer<typeof outcomeSnapshotSchema>;
export type ComplianceCheck = z.infer<typeof complianceCheckSchema>;
