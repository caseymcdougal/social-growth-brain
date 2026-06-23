import { z } from "zod";
import { normalizeCapturedSnapshot } from "./normalize";

const nullableNumber = z.number().int().nonnegative().nullable();
const requiredTrimmedString = z.string().trim().min(1);
const isoDateTime = z.iso.datetime();

const postSchema = z.object({
  xPostId: requiredTrimmedString,
  url: requiredTrimmedString.pipe(z.string().url()),
  text: requiredTrimmedString,
  postedAt: isoDateTime.nullable(),
  capturedAt: isoDateTime,
  source: z.literal("manual"),
  viewsCount: nullableNumber,
  likesCount: nullableNumber,
  repostsCount: nullableNumber,
  repliesCount: nullableNumber,
  bookmarksCount: nullableNumber
});

const snapshotSchema = z.object({
  profile: z.object({
    handle: requiredTrimmedString,
    displayName: requiredTrimmedString,
    bio: z.string(),
    profileUrl: requiredTrimmedString.pipe(z.string().url()),
    followersCount: nullableNumber,
    followingCount: nullableNumber,
    capturedAt: isoDateTime,
    source: z.literal("manual")
  }),
  posts: z.array(postSchema).min(1)
});

export function parseManualImportJson(raw: string) {
  const parsed: unknown = JSON.parse(raw);
  return normalizeCapturedSnapshot(snapshotSchema.parse(parsed));
}
