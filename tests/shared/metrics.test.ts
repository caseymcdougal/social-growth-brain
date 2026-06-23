import { describe, expect, it } from "vitest";
import { parseMetricCount, parseVisibleMetrics } from "../../src/shared/metrics";

describe("parseMetricCount", () => {
  it("parses plain counts", () => {
    expect(parseMetricCount("987")).toBe(987);
  });

  it("parses abbreviated counts", () => {
    expect(parseMetricCount("1.2K")).toBe(1200);
    expect(parseMetricCount("3.4M")).toBe(3400000);
  });

  it("returns null for missing counts", () => {
    expect(parseMetricCount("")).toBeNull();
    expect(parseMetricCount("Views")).toBeNull();
  });
});

describe("parseVisibleMetrics", () => {
  it("extracts known visible X metrics from labels", () => {
    expect(
      parseVisibleMetrics({
        views: "1.4K views",
        likes: "22 likes",
        reposts: "5 reposts",
        replies: "3 replies",
        bookmarks: "1 bookmark"
      })
    ).toEqual({
      viewsCount: 1400,
      likesCount: 22,
      repostsCount: 5,
      repliesCount: 3,
      bookmarksCount: 1
    });
  });
});
