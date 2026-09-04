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

const nullableCount = z.number().int().nonnegative().nullable();

export const creatorArchiveSourceSchema = z.enum(["legacy-sqlite", "x-api-owned-posts"]);
export const creatorArchiveConsentSchema = z.enum(["casey-requested-import", "casey-approved-x-owned-post-import"]);

export const creatorArchiveSchema = z.object({
  schemaVersion: z.literal(SOCIAL_BRAIN_SCHEMA_VERSION),
  id: uuidSchema,
  creatorId: z.literal(CASEY_CREATOR_ID),
  source: creatorArchiveSourceSchema,
  consentBasis: creatorArchiveConsentSchema,
  consentRecordedAt: isoTimestampSchema,
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  importedAt: isoTimestampSchema,
  profile: z
    .object({
      handle: z.literal("caseymcdougal"),
      displayName: z.string(),
      bio: z.string(),
      profileUrl: z.string().url(),
      followersCount: nullableCount,
      followingCount: nullableCount,
      capturedAt: isoTimestampSchema
    })
    .strict()
    .nullable(),
  posts: z.array(
    z.object({
      xPostId: xPostIdSchema,
      url: z.string().url(),
      text: z.string(),
      postedAt: isoTimestampSchema.nullable(),
      capturedAt: isoTimestampSchema,
      viewsCount: nullableCount,
      likesCount: nullableCount,
      repostsCount: nullableCount,
      repliesCount: nullableCount,
      bookmarksCount: nullableCount
    }).strict()
  ),
  voiceProfile: voiceProfileSchema.nullable(),
  voiceOverrides: z.string(),
  strategyMemory: strategyMemorySchema.nullable(),
  creativeDirections: z.array(z.string().trim().min(1)),
  importReport: z.object({
    importedPosts: z.number().int().nonnegative(),
    omittedFields: z.array(z.string().trim().min(1))
  }).strict()
}).strict().superRefine((value, context) => {
  const validPair = (value.source === "legacy-sqlite" && value.consentBasis === "casey-requested-import") ||
    (value.source === "x-api-owned-posts" && value.consentBasis === "casey-approved-x-owned-post-import");
  if (!validPair) {
    context.addIssue({ code: "custom", path: ["consentBasis"], message: "source and consentBasis do not form an allowed pair" });
  }
  if (value.importReport.importedPosts !== value.posts.length) {
    context.addIssue({
      code: "custom",
      path: ["importReport", "importedPosts"],
      message: "importedPosts must equal the number of retained posts"
    });
  }
  if (value.source === "x-api-owned-posts" && value.posts.length > 25) {
    context.addIssue({
      code: "custom",
      path: ["posts"],
      message: "Owned X creator archives may contain at most 25 retained posts"
    });
  }
});

export type CreatorArchive = z.infer<typeof creatorArchiveSchema>;
