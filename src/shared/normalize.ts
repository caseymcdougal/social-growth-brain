import type { CapturedAccountSnapshot, PostSnapshotInput } from "./types";

const MAX_ORIGINAL_POSTS = 25;

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePost(post: PostSnapshotInput): PostSnapshotInput {
  return {
    ...post,
    xPostId: cleanText(post.xPostId),
    url: cleanText(post.url),
    text: cleanText(post.text)
  };
}

export function normalizeCapturedSnapshot(snapshot: CapturedAccountSnapshot): CapturedAccountSnapshot {
  const seen = new Set<string>();
  const posts: PostSnapshotInput[] = [];

  for (const post of snapshot.posts) {
    const normalized = normalizePost(post);
    const key = normalized.xPostId || normalized.url;
    if (!key || seen.has(key) || !normalized.text) continue;
    seen.add(key);
    posts.push(normalized);
    if (posts.length === MAX_ORIGINAL_POSTS) break;
  }

  return {
    profile: {
      ...snapshot.profile,
      handle: cleanText(snapshot.profile.handle).replace(/^@/, ""),
      displayName: cleanText(snapshot.profile.displayName),
      bio: cleanText(snapshot.profile.bio),
      profileUrl: cleanText(snapshot.profile.profileUrl)
    },
    posts
  };
}
