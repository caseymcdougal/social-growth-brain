import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeVoiceProfileJobFiles } from "./voice-profile-runner";
import type { CapturedAccountSnapshot } from "../../shared/types";

describe("voice profile runner", () => {
  it("weights style toward top-quartile posts while keeping the full corpus", () => {
    const snapshot: CapturedAccountSnapshot = {
      profile: {
        handle: "caseymcdougal",
        displayName: "Casey",
        bio: "Local tools",
        profileUrl: "https://x.com/caseymcdougal",
        followersCount: 1000,
        followingCount: 10,
        capturedAt: "2026-07-16T12:00:00.000Z",
        source: "manual"
      },
      posts: [
        {
          xPostId: "winner",
          url: "https://x.com/caseymcdougal/status/winner",
          text: "Winner tone: shipped the handoff checklist today.",
          postedAt: null,
          capturedAt: "2026-07-16T12:00:00.000Z",
          source: "manual",
          viewsCount: 2000,
          likesCount: 40,
          repostsCount: 5,
          repliesCount: 6,
          bookmarksCount: 3
        },
        {
          xPostId: "quiet",
          url: "https://x.com/caseymcdougal/status/quiet",
          text: "Quiet post with almost no signal.",
          postedAt: null,
          capturedAt: "2026-07-16T12:00:00.000Z",
          source: "manual",
          viewsCount: 20,
          likesCount: 0,
          repostsCount: 0,
          repliesCount: 0,
          bookmarksCount: 0
        }
      ]
    };

    const dir = mkdtempSync(join(tmpdir(), "voice-"));
    const files = writeVoiceProfileJobFiles(dir, snapshot);
    const input = readFileSync(files.inputPath, "utf8");
    const prompt = readFileSync(files.promptPath, "utf8");

    expect(input).toContain("topPerformerPosts");
    expect(input).toContain("Winner tone: shipped the handoff checklist today.");
    expect(prompt.toLowerCase()).toContain("topperformerposts");
    expect(prompt.toLowerCase()).toContain("banned_moves");
  });
});
