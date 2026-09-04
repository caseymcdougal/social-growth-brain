import { createHash, randomUUID } from "node:crypto";
import { creatorArchiveSchema, isoTimestampSchema, type CreatorArchive } from "../domain";

const CASEY_HANDLE = "caseymcdougal";
const USERS_ME_ENDPOINT = "https://api.x.com/2/users/me";
const USER_TWEETS_ENDPOINT = "https://api.x.com/2/users";

export const OWNED_X_POST_LIMIT = 25;
export const OWNED_X_IMPORT_BUDGET_CENTS = 5;
export const OWNED_X_READ_SCOPES = ["tweet.read", "users.read"] as const;

export interface FetchOwnedXCreatorArchiveOptions {
  accessToken: string;
  now?: () => Date;
  fetch?: typeof fetch;
  maxPosts?: number;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null;
}

function invalidProfile(): never {
  throw new Error("Invalid X profile response");
}

function invalidTweet(): never {
  throw new Error("Invalid X tweet response");
}

function requiredText(value: unknown, invalid: () => never): string {
  if (typeof value !== "string" || value.trim() === "") return invalid();
  return value;
}

function requiredNumericId(value: unknown, invalid: () => never): string {
  const id = requiredText(value, invalid);
  if (!/^\d+$/.test(id)) return invalid();
  return id;
}

function timestamp(value: unknown, invalid: () => never): string {
  try {
    return isoTimestampSchema.parse(requiredText(value, invalid));
  } catch {
    return invalid();
  }
}

function metric(value: unknown, invalid: () => never): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}

function parseProfile(payload: unknown, capturedAt: string): { id: string; profile: NonNullable<CreatorArchive["profile"]> } {
  const root = record(payload);
  const data = root ? record(root.data) : null;
  if (!data) return invalidProfile();

  const username = requiredText(data.username, invalidProfile).trim().toLowerCase();
  if (username !== CASEY_HANDLE) throw new Error("Unexpected authenticated X username");
  const metrics = record(data.public_metrics);
  if (!metrics) return invalidProfile();

  return {
    id: requiredNumericId(data.id, invalidProfile),
    profile: {
      handle: CASEY_HANDLE,
      displayName: requiredText(data.name, invalidProfile).trim(),
      bio: data.description === undefined ? "" : typeof data.description === "string" ? data.description : invalidProfile(),
      profileUrl: `https://x.com/${CASEY_HANDLE}`,
      followersCount: metric(metrics.followers_count, invalidProfile),
      followingCount: metric(metrics.following_count, invalidProfile),
      capturedAt
    }
  };
}

function isReplyOrRepost(tweet: JsonRecord): boolean {
  const referencedTweets = tweet.referenced_tweets;
  if (referencedTweets === undefined) return false;
  if (!Array.isArray(referencedTweets)) return invalidTweet();
  for (const reference of referencedTweets) {
    const item = record(reference);
    if (!item || typeof item.type !== "string") return invalidTweet();
    if (item.type === "replied_to" || item.type === "retweeted") return true;
  }
  return false;
}

function parseRetainedTweet(value: unknown, capturedAt: string): CreatorArchive["posts"][number] {
  const tweet = record(value);
  if (!tweet) return invalidTweet();
  const metrics = record(tweet.public_metrics);
  if (!metrics) return invalidTweet();

  const id = requiredNumericId(tweet.id, invalidTweet);
  return {
    xPostId: id,
    url: `https://x.com/${CASEY_HANDLE}/status/${id}`,
    text: requiredText(tweet.text, invalidTweet),
    postedAt: timestamp(tweet.created_at, invalidTweet),
    capturedAt,
    viewsCount: metric(metrics.impression_count, invalidTweet),
    likesCount: metric(metrics.like_count, invalidTweet),
    repostsCount: metric(metrics.retweet_count, invalidTweet),
    repliesCount: metric(metrics.reply_count, invalidTweet),
    bookmarksCount: metric(metrics.bookmark_count, invalidTweet)
  };
}

function parseTimeline(payload: unknown, capturedAt: string): { posts: CreatorArchive["posts"]; omittedFields: string[] } {
  const root = record(payload);
  if (!root) return invalidTweet();
  if (root.data === undefined) {
    const meta = record(root.meta);
    if (!meta || meta.result_count !== 0) return invalidTweet();
    return { posts: [], omittedFields: [] };
  }
  if (!Array.isArray(root.data) || root.data.length > OWNED_X_POST_LIMIT) return invalidTweet();

  const posts: CreatorArchive["posts"] = [];
  let excluded = 0;
  for (const value of root.data) {
    const tweet = record(value);
    if (!tweet) return invalidTweet();
    if (isReplyOrRepost(tweet)) {
      excluded += 1;
      continue;
    }
    posts.push(parseRetainedTweet(tweet, capturedAt));
  }

  const seenIds = new Set<string>();
  for (const post of posts) {
    if (seenIds.has(post.xPostId)) return invalidTweet();
    seenIds.add(post.xPostId);
  }
  posts.sort((left, right) => left.xPostId < right.xPostId ? -1 : left.xPostId > right.xPostId ? 1 : 0);
  return {
    posts,
    omittedFields: excluded === 0 ? [] : [`${excluded} reply or repost records excluded`]
  };
}

function profileUrl(): string {
  const url = new URL(USERS_ME_ENDPOINT);
  url.searchParams.set("user.fields", "description,public_metrics,username,name");
  return url.toString();
}

function timelineUrl(userId: string): string {
  const url = new URL(`${USER_TWEETS_ENDPOINT}/${userId}/tweets`);
  url.searchParams.set("max_results", String(OWNED_X_POST_LIMIT));
  url.searchParams.set("exclude", "retweets,replies");
  url.searchParams.set("tweet.fields", "created_at,public_metrics,referenced_tweets");
  return url.toString();
}

async function getJson(fetchImpl: typeof fetch, url: string, accessToken: string, endpoint: "profile" | "timeline"): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    });
  } catch {
    throw new Error(`X ${endpoint} request failed`);
  }
  if (!response || typeof response.ok !== "boolean" || typeof response.status !== "number") {
    throw new Error(`X ${endpoint} request failed`);
  }
  if (!response.ok) throw new Error(`X ${endpoint} request failed with status ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`Invalid X ${endpoint} response`);
  }
}

function assertNoApiErrors(payload: unknown, endpoint: "profile" | "timeline"): void {
  const root = record(payload);
  if (!root || root.errors === undefined) return;
  if (!Array.isArray(root.errors)) throw new Error(`Invalid X ${endpoint} response`);
  if (root.errors.length > 0) throw new Error(`X ${endpoint} response contained errors`);
}

function importedAt(now: () => Date): string {
  try {
    return now().toISOString();
  } catch {
    throw new Error("Invalid X import timestamp");
  }
}

function fingerprintContent(input: {
  schemaVersion: 1;
  creatorId: "casey-mcdougal";
  source: "x-api-owned-posts";
  consentBasis: "casey-approved-x-owned-post-import";
  profile: CreatorArchive["profile"];
  posts: CreatorArchive["posts"];
  voiceProfile: null;
  voiceOverrides: string;
  strategyMemory: null;
  creativeDirections: string[];
  importReport: CreatorArchive["importReport"];
}): string {
  const profile = input.profile === null ? null : (() => {
    const { capturedAt: _capturedAt, ...stableProfile } = input.profile;
    return stableProfile;
  })();
  const posts = input.posts.map(({ capturedAt: _capturedAt, ...stablePost }) => stablePost);
  return createHash("sha256").update(JSON.stringify({ ...input, profile, posts })).digest("hex");
}

/** Fetches at most 25 original posts from the authenticated Casey X account. */
export async function fetchOwnedXCreatorArchive(input: FetchOwnedXCreatorArchiveOptions): Promise<CreatorArchive> {
  const accessToken = typeof input.accessToken === "string" ? input.accessToken.trim() : "";
  if (!accessToken) throw new Error("A nonblank X access token is required");
  const maxPosts = input.maxPosts ?? OWNED_X_POST_LIMIT;
  if (maxPosts !== OWNED_X_POST_LIMIT) throw new Error("Owned X import must request exactly 25 posts");
  const fetchImpl = input.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("X fetch is unavailable");

  const capturedAt = importedAt(input.now ?? (() => new Date()));
  const profilePayload = await getJson(fetchImpl, profileUrl(), accessToken, "profile");
  assertNoApiErrors(profilePayload, "profile");
  const authenticatedProfile = parseProfile(profilePayload, capturedAt);
  const timelinePayload = await getJson(fetchImpl, timelineUrl(authenticatedProfile.id), accessToken, "timeline");
  assertNoApiErrors(timelinePayload, "timeline");
  const timeline = parseTimeline(timelinePayload, capturedAt);
  const archiveWithoutVolatileFields = {
    schemaVersion: 1 as const,
    creatorId: "casey-mcdougal" as const,
    source: "x-api-owned-posts" as const,
    consentBasis: "casey-approved-x-owned-post-import" as const,
    profile: authenticatedProfile.profile,
    posts: timeline.posts,
    voiceProfile: null,
    voiceOverrides: "",
    strategyMemory: null,
    creativeDirections: [],
    importReport: {
      importedPosts: timeline.posts.length,
      omittedFields: timeline.omittedFields
    }
  };
  const archive = {
    ...archiveWithoutVolatileFields,
    id: randomUUID(),
    sourceFingerprint: fingerprintContent(archiveWithoutVolatileFields),
    consentRecordedAt: capturedAt,
    importedAt: capturedAt
  };
  try {
    return creatorArchiveSchema.parse(archive);
  } catch {
    throw new Error("Invalid normalized X archive");
  }
}
