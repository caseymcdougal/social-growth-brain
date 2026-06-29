import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../../src/server/db";
import { createRepositories } from "../../src/server/repositories";
import type { CapturedAccountSnapshot } from "../../src/shared/types";

function snapshot(): CapturedAccountSnapshot {
  return {
    profile: {
      handle: "caseymcdougal",
      displayName: "Casey McDougal",
      bio: "Building AI tools.",
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
        text: "A useful dashboard tells you what to do next.",
        postedAt: null,
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
}

describe("repositories", () => {
  it("enforces SQLite foreign keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-"));
    const db = openDatabase(join(dir, "test.sqlite"));

    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("saves and reads the latest captured snapshot", () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-"));
    const db = openDatabase(join(dir, "test.sqlite"));
    const repos = createRepositories(db);

    const profileId = repos.saveCapturedSnapshot(snapshot());
    const latest = repos.getLatestSnapshot();

    expect(profileId).toBeGreaterThan(0);
    expect(latest?.profile.handle).toBe("caseymcdougal");
    expect(latest?.posts).toHaveLength(1);
    expect(latest?.posts[0].text).toContain("dashboard");
    expect(latest?.posts[0].viewsCount).toBe(1400);
    expect(latest?.posts[0].likesCount).toBe(22);
  });

  it("round-trips nullable visible metrics", () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-"));
    const db = openDatabase(join(dir, "test.sqlite"));
    const repos = createRepositories(db);

    repos.saveCapturedSnapshot({
      ...snapshot(),
      posts: [
        {
          ...snapshot().posts[0],
          xPostId: "nullable-metrics",
          url: "https://x.com/caseymcdougal/status/nullable-metrics",
          viewsCount: null,
          likesCount: null,
          repostsCount: null,
          repliesCount: null,
          bookmarksCount: null
        }
      ]
    });
    const latest = repos.getLatestSnapshot();

    expect(latest?.posts[0]).toMatchObject({
      viewsCount: null,
      likesCount: null,
      repostsCount: null,
      repliesCount: null,
      bookmarksCount: null
    });
  });

  it("returns recent captured snapshots newest first", () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-"));
    const db = openDatabase(join(dir, "test.sqlite"));
    const repos = createRepositories(db);

    repos.saveCapturedSnapshot({
      ...snapshot(),
      profile: { ...snapshot().profile, capturedAt: "2026-06-20T18:00:00.000Z", followersCount: 1200 },
      posts: [
        {
          ...snapshot().posts[0],
          xPostId: "older",
          text: "Older scan post.",
          capturedAt: "2026-06-20T18:00:00.000Z",
          viewsCount: 500
        }
      ]
    });
    repos.saveCapturedSnapshot({
      ...snapshot(),
      profile: { ...snapshot().profile, capturedAt: "2026-06-26T18:00:00.000Z", followersCount: 1250 },
      posts: [
        {
          ...snapshot().posts[0],
          xPostId: "newer",
          text: "Newer scan post.",
          capturedAt: "2026-06-26T18:00:00.000Z",
          viewsCount: 1500
        }
      ]
    });

    const history = repos.getRecentSnapshots(2);

    expect(history).toHaveLength(2);
    expect(history[0].profile.capturedAt).toBe("2026-06-26T18:00:00.000Z");
    expect(history[0].profile.followersCount).toBe(1250);
    expect(history[0].posts[0].xPostId).toBe("newer");
    expect(history[1].profile.capturedAt).toBe("2026-06-20T18:00:00.000Z");
  });
});
