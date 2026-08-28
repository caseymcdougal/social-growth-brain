import { z } from "zod";
import {
  actionTypeSchema,
  CASEY_CREATOR_ID,
  isoTimestampSchema,
  opportunityStatusSchema,
  SOCIAL_BRAIN_SCHEMA_VERSION,
  uuidSchema,
  xPostIdSchema
} from "./common";

export const opportunityForecastSchema = z
  .object({
    probability1k24h: z.number().min(0).max(1),
    probability1k48h: z.number().min(0).max(1),
    viewsP10: z.number().int().nonnegative(),
    viewsP50: z.number().int().nonnegative(),
    viewsP90: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    predictedAt: isoTimestampSchema,
    calibrationVersion: z.string().trim().min(1)
  })
  .superRefine((value, context) => {
    if (value.probability1k24h > value.probability1k48h) {
      context.addIssue({ code: "custom", message: "24h probability cannot exceed 48h probability" });
    }
    if (value.viewsP10 > value.viewsP50 || value.viewsP50 > value.viewsP90) {
      context.addIssue({ code: "custom", message: "view quantiles must be ordered P10 <= P50 <= P90" });
    }
  });

export const scorerProvenanceSchema = z.object({
  sourceKind: z.enum(["synthetic", "official-x-api", "manual-nomination", "legacy-import"]),
  pipelineRunId: uuidSchema,
  eligibilityVersion: z.string().trim().min(1),
  featureVersion: z.string().trim().min(1),
  strategyVersion: z.string().trim().min(1),
  voiceProfileVersion: z.string().trim().min(1),
  judgeModel: z.string().trim().min(1),
  promptTemplateVersion: z.string().trim().min(1),
  forecastPolicyVersion: z.string().trim().min(1)
});

export const opportunitySchema = z
  .object({
    schemaVersion: z.literal(SOCIAL_BRAIN_SCHEMA_VERSION),
    id: uuidSchema,
    creatorId: z.literal(CASEY_CREATOR_ID),
    revision: z.number().int().positive(),
    status: opportunityStatusSchema,
    actionType: actionTypeSchema,
    targetPostId: xPostIdSchema.nullable(),
    detectedAt: isoTimestampSchema,
    publishBy: isoTimestampSchema,
    forecast: opportunityForecastSchema,
    recommendedDraftId: uuidSchema.nullable(),
    evidenceIds: z.array(uuidSchema).min(1),
    provenance: scorerProvenanceSchema,
    createdAt: isoTimestampSchema,
    revisedAt: isoTimestampSchema
  })
  .superRefine((value, context) => {
    if (value.actionType === "original" && value.targetPostId !== null) {
      context.addIssue({ code: "custom", path: ["targetPostId"], message: "original posts cannot target a Post" });
    }
    if (value.actionType !== "original" && value.targetPostId === null) {
      context.addIssue({ code: "custom", path: ["targetPostId"], message: "replies and quotes require a target Post" });
    }
    if (Date.parse(value.publishBy) <= Date.parse(value.detectedAt)) {
      context.addIssue({ code: "custom", path: ["publishBy"], message: "publishBy must follow detectedAt" });
    }
  });

export type OpportunityForecast = z.infer<typeof opportunityForecastSchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
