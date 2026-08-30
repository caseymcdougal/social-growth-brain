import { z } from "zod";

export const SOCIAL_BRAIN_SCHEMA_VERSION = 1 as const;
export const CASEY_CREATOR_ID = "casey-mcdougal" as const;

export const isoTimestampSchema = z.string().datetime({ offset: true });
export const uuidSchema = z.string().uuid();
export const xPostIdSchema = z.string().regex(/^\d+$/);
export const actionTypeSchema = z.enum(["reply", "quote", "original"]);
export const opportunityStatusSchema = z.enum([
  "candidate",
  "eligible",
  "scored",
  "surfaced",
  "approved",
  "rejected",
  "expired",
  "publishing",
  "published",
  "publish_uncertain",
  "failed",
  "measuring",
  "matured"
]);

export type ActionType = z.infer<typeof actionTypeSchema>;
export type OpportunityStatus = z.infer<typeof opportunityStatusSchema>;
