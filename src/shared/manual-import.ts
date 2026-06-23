import { z } from "zod";
import { normalizeCapturedSnapshot } from "./normalize";

const nullableNumber = z.number().int().nonnegative().nullable();

const postSchema = z.object({
  xPostId: z.string().min(1),
  url: z.string().url(),
  text: z.string().min(1),
  postedAt: z.string().nullable(),
  capturedAt: z.string(),
  source: z.literal("manual"),
  viewsCount: nullableNumber,
  likesCount: nullableNumber,
  repostsCount: nullableNumber,
  repliesCount: nullableNumber,
  bookmarksCount: nullableNumber
});

const snapshotSchema = z.object({
  profile: z.object({
    handle: z.string().min(1),
    displayName: z.string().min(1),
    bio: z.string(),
    profileUrl: z.string().url(),
    followersCount: nullableNumber,
    followingCount: nullableNumber,
    capturedAt: z.string(),
    source: z.literal("manual")
  }),
  posts: z.array(postSchema).min(1)
});

export function parseManualImportJson(raw: string) {
  const parsed: unknown = JSON.parse(raw);
  return normalizeCapturedSnapshot(snapshotSchema.parse(parsed));
}
