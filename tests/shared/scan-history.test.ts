import { describe, expect, it } from "vitest";
import { buildScanHistoryBrief } from "../../src/shared/scan-history";
import type { CapturedAccountSnapshot, PostSnapshotInput } from "../../src/shared/types";

function post(input: Partial<PostSnapshotInput> & Pick<PostSnapshotInput, "xPostId" | "text">): PostSnapshotInput {
  return {
    xPostId: input.xPostId,
    url: input.url ?? `https://x.com/caseymcdougal/status/${input.xPostId}`,
    text: input.text,
    postedAt: input.postedAt ?? "2026-06-20T15:00:00.000Z",
    capturedAt: input.capturedAt ?? "2026-06-20T18:00:00.000Z",
    source: "manual",
    viewsCount: input.viewsCount ?? 0,
    likesCount: input.likesCount ?? 0,
    repostsCount: input.repostsCount ?? 0,
    repliesCount: input.repliesCount ?? 0,
    bookmarksCount: input.bookmarksCount ?? 0
  };
}

function snapshot({
  capturedAt,
  followersCount,
  posts
}: {
  capturedAt: string;
  followersCount: number;
  posts: PostSnapshotInput[];
}): CapturedAccountSnapshot {
  return {
    profile: {
      handle: "caseymcdougal",
      displayName: "Casey McDougal",
      bio: "Building AI tools and internet products.",
      profileUrl: "https://x.com/caseymcdougal",
      followersCount,
      followingCount: 450,
      capturedAt,
      source: "manual"
    },
    posts: posts.map((item) => ({ ...item, capturedAt }))
  };
}

describe("scan history", () => {
  it("compares the latest scan against the previous scan", () => {
    const previous = snapshot({
      capturedAt: "2026-06-20T18:00:00.000Z",
      followersCount: 1200,
      posts: [
        post({
          xPostId: "older-winner",
          text: "A useful dashboard tells you what to do next.",
          viewsCount: 1000,
          likesCount: 10,
          repostsCount: 2,
          repliesCount: 1
        }),
        post({ xPostId: "quiet", text: "Quiet post.", viewsCount: 500, likesCount: 2 })
      ]
    });
    const current = snapshot({
      capturedAt: "2026-06-26T18:00:00.000Z",
      followersCount: 1250,
      posts: [
        post({
          xPostId: "new-winner",
          text: "The best social audit tools should turn a scan into a next move.",
          viewsCount: 3000,
          likesCount: 20,
          repostsCount: 4,
          repliesCount: 8,
          bookmarksCount: 3
        }),
        post({
          xPostId: "older-winner",
          text: "A useful dashboard tells you what to do next.",
          viewsCount: 1200,
          likesCount: 12,
          repostsCount: 2,
          repliesCount: 2,
          bookmarksCount: 1
        })
      ]
    });

    const brief = buildScanHistoryBrief([current, previous]);

    expect(brief.status).toBe("ready");
    expect(brief.summary).toBe("Median visible signal up by 68 since previous scan.");
    expect(brief.current.medianSignal).toBe(94);
    expect(brief.previous?.medianSignal).toBe(27);
    expect(brief.deltas).toEqual(
      expect.objectContaining({
        medianSignal: 68,
        followers: 50,
        postCount: 0
      })
    );
    expect(brief.topPostShift).toMatchObject({
      status: "new-top-post",
      label: "New top post took over",
      currentTitle: "The best social audit tools should turn a scan into a next move."
    });
    expect(brief.nextAction).toBe("Double down on the new winner, then scan again after the next post lands.");
  });

  it("asks for another scan when there is only one snapshot", () => {
    const current = snapshot({
      capturedAt: "2026-06-26T18:00:00.000Z",
      followersCount: 1250,
      posts: [post({ xPostId: "only", text: "The first tracked scan.", viewsCount: 1000, likesCount: 8 })]
    });

    const brief = buildScanHistoryBrief([current]);

    expect(brief.status).toBe("single-scan");
    expect(brief.summary).toBe("One scan captured. Trendline starts after the next scan.");
    expect(brief.previous).toBeNull();
    expect(brief.nextAction).toBe("Run another public scan after the next posting cycle to unlock deltas.");
  });

  it("handles empty history", () => {
    const brief = buildScanHistoryBrief([]);

    expect(brief.status).toBe("empty");
    expect(brief.summary).toBe("No scans captured yet.");
    expect(brief.current).toEqual({
      capturedAt: null,
      postCount: 0,
      followersCount: null,
      medianSignal: 0,
      topPostText: "Awaiting scan",
      metricCoveragePercent: 0
    });
  });
});
