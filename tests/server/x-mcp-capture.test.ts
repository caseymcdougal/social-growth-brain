import { describe, expect, it, vi } from "vitest";
import { XMcpCaptureRunner, type XMcpToolClient } from "../../src/server/capture/x-mcp-capture";

function mcpResult(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }]
  };
}

describe("XMcpCaptureRunner", () => {
  it("captures a profile and recent original posts through X MCP tools", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const client: XMcpToolClient = {
      connect: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      callTool: vi.fn(async (name, args) => {
        calls.push({ name, args });
        if (name === "getUsersByUsername") {
          return mcpResult({
            data: {
              id: "123",
              username: "caseymcdougal",
              name: "Casey McDougal",
              description: "Building AI tools and internet products.",
              public_metrics: {
                followers_count: 1200,
                following_count: 450
              }
            }
          });
        }
        return mcpResult({
          data: [
            {
              id: "10",
              text: "Most social dashboards report the past. The useful ones tell you what to write next.",
              created_at: "2026-06-29T15:00:00.000Z",
              public_metrics: {
                impression_count: 1400,
                like_count: 22,
                retweet_count: 5,
                reply_count: 3,
                bookmark_count: 1
              }
            },
            {
              id: "11",
              text: "Retweeted content should not enter the audit.",
              referenced_tweets: [{ type: "retweeted", id: "9" }]
            }
          ]
        });
      })
    };
    const runner = new XMcpCaptureRunner({
      clientFactory: () => client,
      now: () => "2026-06-30T17:00:00.000Z"
    });

    const snapshot = await runner.captureRecentPosts("@caseymcdougal");

    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledOnce();
    expect(calls[0]).toMatchObject({
      name: "getUsersByUsername",
      args: {
        username: "caseymcdougal",
        "user.fields": expect.arrayContaining(["description", "public_metrics"])
      }
    });
    expect(calls[1]).toMatchObject({
      name: "getUsersPosts",
      args: {
        id: "123",
        max_results: 25,
        exclude: ["retweets", "replies"],
        "tweet.fields": expect.arrayContaining(["created_at", "public_metrics"])
      }
    });
    expect(snapshot.profile).toMatchObject({
      handle: "caseymcdougal",
      displayName: "Casey McDougal",
      followersCount: 1200,
      followingCount: 450,
      capturedAt: "2026-06-30T17:00:00.000Z",
      source: "x_mcp"
    });
    expect(snapshot.posts).toHaveLength(1);
    expect(snapshot.posts[0]).toMatchObject({
      xPostId: "10",
      url: "https://x.com/caseymcdougal/status/10",
      postedAt: "2026-06-29T15:00:00.000Z",
      viewsCount: 1400,
      likesCount: 22,
      repostsCount: 5,
      repliesCount: 3,
      bookmarksCount: 1,
      capturedAt: "2026-06-30T17:00:00.000Z",
      source: "x_mcp"
    });
  });
});
