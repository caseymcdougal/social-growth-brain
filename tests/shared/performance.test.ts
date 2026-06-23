import { describe, expect, it } from "vitest";
import {
  rankPostsByVisibleSignal,
  scorePostByVisibleSignal,
  summarizeMetricCompleteness
} from "../../src/shared/performance";
import type { PostSnapshotInput } from "../../src/shared/types";

function post(overrides: Partial<PostSnapshotInput>): PostSnapshotInput {
  return {
    xPostId: "post-default",
    url: "https://x.com/caseymcdougal/status/1",
    text: "Default post",
    postedAt: null,
    capturedAt: "2026-06-23T12:00:00.000Z",
    source: "browser",
    viewsCount: null,
    likesCount: null,
    repostsCount: null,
    repliesCount: null,
    bookmarksCount: null,
    ...overrides
  };
}

describe("visible performance helpers", () => {
  it("scores public metrics with engagement weighted above raw views", () => {
    const engagedPost = post({
      xPostId: "engaged",
      viewsCount: 100,
      likesCount: 10,
      repostsCount: 2,
      repliesCount: 2,
      bookmarksCount: 0
    });
    const passiveViewsPost = post({
      xPostId: "passive",
      viewsCount: 2000,
      likesCount: 1,
      repostsCount: 0,
      repliesCount: 0,
      bookmarksCount: 0
    });

    expect(scorePostByVisibleSignal(engagedPost)).toBeGreaterThan(scorePostByVisibleSignal(passiveViewsPost));
  });

  it("ranks posts by visible signal and keeps the original post attached", () => {
    const ranked = rankPostsByVisibleSignal([
      post({ xPostId: "middle", viewsCount: 400, likesCount: 5, repostsCount: 0, repliesCount: 1, bookmarksCount: 0 }),
      post({ xPostId: "winner", viewsCount: 150, likesCount: 12, repostsCount: 3, repliesCount: 4, bookmarksCount: 1 }),
      post({ xPostId: "quiet", viewsCount: 1000, likesCount: 0, repostsCount: 0, repliesCount: 0, bookmarksCount: 0 })
    ]);

    expect(ranked.map((item) => [item.rank, item.post.xPostId])).toEqual([
      [1, "winner"],
      [2, "middle"],
      [3, "quiet"]
    ]);
  });

  it("summarizes metric completeness without treating missing values as zero", () => {
    const summary = summarizeMetricCompleteness([
      post({ xPostId: "one", viewsCount: 100, likesCount: 4, repostsCount: 1 }),
      post({ xPostId: "two", repliesCount: 2, bookmarksCount: 1 })
    ]);

    expect(summary).toEqual({
      capturedFields: 5,
      totalFields: 10,
      missingFields: 5,
      completenessRatio: 0.5,
      postsWithAnyMetrics: 2,
      postsWithFullMetrics: 0
    });
  });
});
