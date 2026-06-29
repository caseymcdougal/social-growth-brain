import { describe, expect, it } from "vitest";
import { parseMetricCount, parseMetricFromLabelText, parseVisibleMetrics } from "../../src/shared/metrics";

describe("parseMetricCount", () => {
  it("parses plain counts", () => {
    expect(parseMetricCount("987")).toBe(987);
  });

  it("parses abbreviated counts", () => {
    expect(parseMetricCount("1.2K")).toBe(1200);
    expect(parseMetricCount("3.4M")).toBe(3400000);
    expect(parseMetricCount("2,345")).toBe(2345);
  });

  it("returns null for missing counts", () => {
    expect(parseMetricCount("")).toBeNull();
    expect(parseMetricCount("Views")).toBeNull();
  });
});

describe("parseMetricFromLabelText", () => {
  it("extracts counts from combined X action labels", () => {
    const label = "12 replies, 4 reposts, 99 likes, 7 bookmarks, 1.8K views";

    expect(parseMetricFromLabelText(label, ["reply", "replies"])).toBe(12);
    expect(parseMetricFromLabelText(label, ["repost", "reposts"])).toBe(4);
    expect(parseMetricFromLabelText(label, ["like", "likes"])).toBe(99);
    expect(parseMetricFromLabelText(label, ["bookmark", "bookmarks"])).toBe(7);
    expect(parseMetricFromLabelText(label, ["view", "views"])).toBe(1800);
  });

  it("extracts counts when X places the label before the number", () => {
    expect(parseMetricFromLabelText("View post analytics 2,345 views", ["view", "views"])).toBe(2345);
  });

  it("extracts profile stat counts from X follower labels", () => {
    expect(parseMetricFromLabelText("1,234 Followers", ["follower", "followers"])).toBe(1234);
    expect(parseMetricFromLabelText("Following 287", ["following"])).toBe(287);
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
