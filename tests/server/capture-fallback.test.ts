import { describe, expect, it, vi } from "vitest";
import { CaptureError, type CaptureRunner } from "../../src/server/capture/capture-runner";
import { FallbackCaptureRunner } from "../../src/server/capture/fallback-capture-runner";
import type { CapturedAccountSnapshot } from "../../src/shared/types";

const fallbackSnapshot: CapturedAccountSnapshot = {
  profile: {
    handle: "caseymcdougal",
    displayName: "Casey McDougal",
    bio: "Building AI tools and internet products.",
    profileUrl: "https://x.com/caseymcdougal",
    followersCount: 1200,
    followingCount: 450,
    capturedAt: "2026-06-30T17:00:00.000Z",
    source: "browser"
  },
  posts: [
    {
      xPostId: "1",
      url: "https://x.com/caseymcdougal/status/1",
      text: "Fallback post",
      postedAt: "2026-06-30T16:00:00.000Z",
      capturedAt: "2026-06-30T17:00:00.000Z",
      source: "browser",
      viewsCount: 10,
      likesCount: 1,
      repostsCount: 0,
      repliesCount: 0,
      bookmarksCount: 0
    }
  ]
};

describe("FallbackCaptureRunner", () => {
  it("uses the secondary capture runner when the primary MCP runner fails", async () => {
    const primary: CaptureRunner = {
      captureRecentPosts: vi.fn(async () => {
        throw new CaptureError("browser_not_reachable", "X MCP unavailable");
      })
    };
    const secondary: CaptureRunner = {
      captureRecentPosts: vi.fn(async () => fallbackSnapshot)
    };
    const runner = new FallbackCaptureRunner(primary, secondary);

    const snapshot = await runner.captureRecentPosts("caseymcdougal");

    expect(primary.captureRecentPosts).toHaveBeenCalledWith("caseymcdougal");
    expect(secondary.captureRecentPosts).toHaveBeenCalledWith("caseymcdougal");
    expect(snapshot.profile.source).toBe("browser");
  });

  it("does not call the secondary runner after a successful primary capture", async () => {
    const mcpSnapshot: CapturedAccountSnapshot = {
      ...fallbackSnapshot,
      profile: { ...fallbackSnapshot.profile, source: "x_mcp" }
    };
    const primary: CaptureRunner = {
      captureRecentPosts: vi.fn(async () => mcpSnapshot)
    };
    const secondary: CaptureRunner = {
      captureRecentPosts: vi.fn(async () => fallbackSnapshot)
    };
    const runner = new FallbackCaptureRunner(primary, secondary);

    const snapshot = await runner.captureRecentPosts("caseymcdougal");

    expect(snapshot.profile.source).toBe("x_mcp");
    expect(secondary.captureRecentPosts).not.toHaveBeenCalled();
  });
});
