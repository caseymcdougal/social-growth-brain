import { describe, expect, it } from "vitest";
import {
  OWNED_X_IMPORT_BUDGET_CENTS,
  OWNED_X_POST_LIMIT,
  OWNED_X_READ_SCOPES,
  fetchOwnedXCreatorArchive
} from "../../../src/brain/import/x-owned-posts-client";

const TOKEN = "x-access-token-must-never-appear-in-errors";
const IMPORTED_AT = "2026-09-03T12:00:00.000Z";

type Call = { url: string; init?: RequestInit };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function fakeFetch(responses: Response[]): { calls: Call[]; fetch: typeof fetch } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      const response = responses.shift();
      if (!response) throw new Error("Unexpected fetch call");
      return response;
    }) as typeof fetch
  };
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: "123",
      username: "CaseyMcDougal",
      name: "Casey McDougal",
      description: "Building useful things.",
      public_metrics: { followers_count: 101, following_count: 12 },
      ...overrides
    }
  };
}

function originalPost(overrides: Record<string, unknown> = {}) {
  return {
    id: "100",
    text: "A retained original post.",
    created_at: "2026-09-01T10:00:00.000Z",
    public_metrics: {
      impression_count: 50,
      like_count: 3,
      retweet_count: 2,
      reply_count: 1,
      bookmark_count: 4
    },
    ...overrides
  };
}

function timeline(posts: unknown[]) {
  return { data: posts, meta: { result_count: posts.length } };
}

async function importArchive(responses: Response[], input: { maxPosts?: number; now?: () => Date } = {}) {
  const mocked = fakeFetch(responses);
  const archive = await fetchOwnedXCreatorArchive({
    accessToken: TOKEN,
    fetch: mocked.fetch,
    now: input.now ?? (() => new Date(IMPORTED_AT)),
    maxPosts: input.maxPosts
  });
  return { archive, ...mocked };
}

describe("fetchOwnedXCreatorArchive", () => {
  it("uses exactly the fixed read-only profile and one-page owned-timeline requests", async () => {
    const { archive, calls } = await importArchive([
      json(profile()),
      json(timeline([originalPost(), originalPost({ id: "101", text: "A second retained post." })]))
    ]);

    expect(OWNED_X_POST_LIMIT).toBe(25);
    expect(OWNED_X_IMPORT_BUDGET_CENTS).toBe(5);
    expect(OWNED_X_READ_SCOPES).toEqual(["tweet.read", "users.read"]);
    expect(calls).toHaveLength(2);
    expect(calls.map(({ url }) => new URL(url).origin + new URL(url).pathname)).toEqual([
      "https://api.x.com/2/users/me",
      "https://api.x.com/2/users/123/tweets"
    ]);
    expect(new URL(calls[0]!.url).searchParams.get("user.fields")).toBe("description,public_metrics,username,name");
    expect(new URL(calls[1]!.url).searchParams.get("max_results")).toBe("25");
    expect(new URL(calls[1]!.url).searchParams.get("exclude")).toBe("retweets,replies");
    expect(new URL(calls[1]!.url).searchParams.get("tweet.fields")).toBe("created_at,public_metrics,referenced_tweets");
    for (const call of calls) {
      expect(call.init?.method).toBe("GET");
      expect(call.init?.redirect).toBe("error");
      expect(new Headers(call.init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
      expect(new Headers(call.init?.headers).get("accept")).toBe("application/json");
    }
    expect(archive).toMatchObject({
      creatorId: "casey-mcdougal",
      source: "x-api-owned-posts",
      consentBasis: "casey-approved-x-owned-post-import",
      consentRecordedAt: IMPORTED_AT,
      importedAt: IMPORTED_AT,
      profile: {
        handle: "caseymcdougal",
        displayName: "Casey McDougal",
        bio: "Building useful things.",
        profileUrl: "https://x.com/caseymcdougal",
        followersCount: 101,
        followingCount: 12,
        capturedAt: IMPORTED_AT
      },
      posts: [
        expect.objectContaining({
          xPostId: "100",
          url: "https://x.com/caseymcdougal/status/100",
          text: "A retained original post.",
          postedAt: "2026-09-01T10:00:00.000Z",
          capturedAt: IMPORTED_AT,
          viewsCount: 50,
          likesCount: 3,
          repostsCount: 2,
          repliesCount: 1,
          bookmarksCount: 4
        }),
        expect.objectContaining({ xPostId: "101" })
      ],
      voiceProfile: null,
      voiceOverrides: "",
      strategyMemory: null,
      creativeDirections: [],
      importReport: { importedPosts: 2, omittedFields: [] }
    });
    expect(archive.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(archive.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates the same fingerprint for identical normalized input regardless of import timestamp", async () => {
    const first = await importArchive([json(profile()), json(timeline([originalPost()]))], {
      now: () => new Date("2026-09-03T12:00:00.000Z")
    });
    const second = await importArchive([json(profile()), json(timeline([originalPost()]))], {
      now: () => new Date("2026-09-03T13:00:00.000Z")
    });

    expect(first.archive.id).not.toBe(second.archive.id);
    expect(first.archive.sourceFingerprint).toBe(second.archive.sourceFingerprint);
  });

  it("uses an empty bio when X omits an otherwise optional description", async () => {
    const { archive } = await importArchive([
      json(profile({ description: undefined })),
      json(timeline([originalPost()]))
    ]);

    expect(archive.profile?.bio).toBe("");
  });

  it("fails closed before a timeline request for an authenticated account other than Casey", async () => {
    const mocked = fakeFetch([json(profile({ username: "someone-else" }))]);

    await expect(fetchOwnedXCreatorArchive({ accessToken: TOKEN, fetch: mocked.fetch })).rejects.toThrow("authenticated X username");
    expect(mocked.calls).toHaveLength(1);
  });

  it("filters reply and repost records even when the API includes them", async () => {
    const { archive, calls } = await importArchive([
      json(profile()),
      json(timeline([
        originalPost({ id: "100" }),
        originalPost({ id: "101", referenced_tweets: [{ type: "replied_to", id: "99" }] }),
        originalPost({ id: "102", referenced_tweets: [{ type: "retweeted", id: "98" }] }),
        originalPost({ id: "103", referenced_tweets: [{ type: "quoted", id: "97" }] })
      ]))
    ]);

    expect(calls).toHaveLength(2);
    expect(archive.posts.map((post) => post.xPostId)).toEqual(["100", "103"]);
    expect(archive.importReport).toEqual({
      importedPosts: 2,
      omittedFields: ["2 reply or repost records excluded"]
    });
  });

  it("fails closed when profile or retained tweet fields are malformed", async () => {
    await expect(importArchive([json(profile({ id: null }))])).rejects.toThrow("Invalid X profile");
    await expect(importArchive([json(profile({ description: null }))])).rejects.toThrow("Invalid X profile");
    await expect(importArchive([json(profile()), json(timeline([originalPost({ text: null })]))])).rejects.toThrow("Invalid X tweet");
    await expect(importArchive([json(profile()), json(timeline([originalPost({ public_metrics: { like_count: -1 } })]))])).rejects.toThrow("Invalid X tweet");
  });

  it("fails closed before parsing a profile or timeline response with API errors", async () => {
    const profileErrors = fakeFetch([json({ ...profile(), errors: [{ detail: TOKEN }] })]);
    await expect(fetchOwnedXCreatorArchive({ accessToken: TOKEN, fetch: profileErrors.fetch })).rejects.toThrow("X profile response contained errors");
    expect(profileErrors.calls).toHaveLength(1);

    const timelineErrors = fakeFetch([
      json(profile()),
      json({ ...timeline([originalPost()]), errors: [{ detail: TOKEN }] })
    ]);
    let message = "";
    try {
      await fetchOwnedXCreatorArchive({ accessToken: TOKEN, fetch: timelineErrors.fetch });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("X timeline response contained errors");
    expect(message).not.toContain(TOKEN);
    expect(timelineErrors.calls).toHaveLength(2);

    await expect(importArchive([json({ ...profile(), errors: { detail: "malformed" } })])).rejects.toThrow("Invalid X profile response");
  });

  it("rejects a non-25 post limit before any fetch", async () => {
    for (const maxPosts of [0, 24, 26]) {
      const mocked = fakeFetch([]);
      await expect(fetchOwnedXCreatorArchive({ accessToken: TOKEN, maxPosts, fetch: mocked.fetch })).rejects.toThrow("exactly 25");
      expect(mocked.calls).toHaveLength(0);
    }
  });

  it("rejects a blank token before any fetch", async () => {
    const mocked = fakeFetch([]);

    await expect(fetchOwnedXCreatorArchive({ accessToken: " \n", fetch: mocked.fetch })).rejects.toThrow("access token");
    expect(mocked.calls).toHaveLength(0);
  });

  it("reports upstream failures without leaking the token or response body", async () => {
    const mocked = fakeFetch([json({ detail: TOKEN }, 403)]);
    let message = "";

    try {
      await fetchOwnedXCreatorArchive({ accessToken: TOKEN, fetch: mocked.fetch });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("X profile request failed with status 403");
    expect(message).not.toContain(TOKEN);
    expect(mocked.calls).toHaveLength(1);
  });

  it("does not follow a redirect or leak its error details", async () => {
    const calls: Call[] = [];
    const redirectingFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      throw new Error(`redirected to a token-bearing URL: ${TOKEN}`);
    }) as typeof fetch;
    let message = "";

    try {
      await fetchOwnedXCreatorArchive({ accessToken: TOKEN, fetch: redirectingFetch });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.init?.redirect).toBe("error");
    expect(message).toBe("X profile request failed");
    expect(message).not.toContain(TOKEN);
  });
});
