import { describe, expect, it } from "vitest";
import { parseManualImportJson } from "../../src/shared/manual-import";
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

describe("parseManualImportJson", () => {
  const validSnapshot = {
    profile: {
      handle: "caseymcdougal",
      displayName: "Casey McDougal",
      bio: "Building AI tools and internet products.",
      profileUrl: "https://x.com/caseymcdougal",
      followersCount: 1200,
      followingCount: 450,
      capturedAt: "2026-06-22T18:00:00.000Z",
      source: "manual"
    },
    posts: [
      {
        xPostId: "1",
        url: "https://x.com/caseymcdougal/status/1",
        text: "Most social dashboards tell you what happened.",
        postedAt: "2026-06-21T16:00:00.000Z",
        capturedAt: "2026-06-22T18:00:00.000Z",
        source: "manual",
        viewsCount: 1400,
        likesCount: 22,
        repostsCount: 5,
        repliesCount: 3,
        bookmarksCount: 1
      }
    ]
  };

  it("rejects invalid date strings", () => {
    expect(() =>
      parseManualImportJson(
        JSON.stringify({
          ...validSnapshot,
          profile: {
            ...validSnapshot.profile,
            capturedAt: "not-a-date"
          }
        })
      )
    ).toThrow();

    expect(() =>
      parseManualImportJson(
        JSON.stringify({
          ...validSnapshot,
          posts: [
            {
              ...validSnapshot.posts[0],
              postedAt: "yesterday"
            }
          ]
        })
      )
    ).toThrow();
  });

  it("rejects whitespace-only post text before normalization", () => {
    expect(() =>
      parseManualImportJson(
        JSON.stringify({
          ...validSnapshot,
          posts: [
            {
              ...validSnapshot.posts[0],
              text: "   \n\t   "
            }
          ]
        })
      )
    ).toThrow();
  });
});
