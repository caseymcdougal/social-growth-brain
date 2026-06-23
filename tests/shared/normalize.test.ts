import { describe, expect, it } from "vitest";
import { normalizeCapturedSnapshot } from "../../src/shared/normalize";

describe("normalizeCapturedSnapshot", () => {
  it("dedupes posts, trims text, and caps to 25 posts", () => {
    const now = "2026-06-22T18:00:00.000Z";
    const posts = Array.from({ length: 27 }, (_, index) => ({
      xPostId: index === 1 ? "post-0" : `post-${index}`,
      url: `https://x.com/casey/status/${index === 1 ? "0" : index}`,
      text: `  Post ${index}  `,
      postedAt: null,
      capturedAt: now,
      source: "manual" as const,
      viewsCount: index,
      likesCount: null,
      repostsCount: null,
      repliesCount: null,
      bookmarksCount: null
    }));

    const normalized = normalizeCapturedSnapshot({
      profile: {
        handle: " caseymcdougal ",
        displayName: " Casey ",
        bio: " building ",
        profileUrl: "https://x.com/caseymcdougal",
        followersCount: null,
        followingCount: null,
        capturedAt: now,
        source: "manual"
      },
      posts
    });

    expect(normalized.profile.handle).toBe("caseymcdougal");
    expect(normalized.profile.displayName).toBe("Casey");
    expect(normalized.posts).toHaveLength(25);
    expect(normalized.posts[0].text).toBe("Post 0");
    expect(new Set(normalized.posts.map((post) => post.xPostId)).size).toBe(25);
  });
});
