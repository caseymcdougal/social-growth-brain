import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deriveCreatorBaseline,
  type BaselineProcessRequest,
  type RunBaselineProcess
} from "../../../src/brain/baseline/codex-baseline-runner";
import type { CreatorArchive, CreatorBaselineModelOutput } from "../../../src/brain/domain";

const roots: string[] = [];
const SECRET = "must-not-leak";

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(fs.realpathSync(tmpdir()), "baseline-runner-test-"));
  roots.push(root);
  return root;
}

function archive(): CreatorArchive {
  return {
    schemaVersion: 1,
    id: "10000000-0000-4000-8000-000000000001",
    creatorId: "casey-mcdougal",
    source: "x-api-owned-posts",
    consentBasis: "casey-approved-x-owned-post-import",
    consentRecordedAt: "2026-09-04T20:00:00.000Z",
    sourceFingerprint: "a".repeat(64),
    importedAt: "2026-09-04T20:01:00.000Z",
    profile: {
      handle: "caseymcdougal",
      displayName: "Casey McDougal",
      bio: "Builder",
      profileUrl: "https://x.com/caseymcdougal",
      followersCount: 100,
      followingCount: 50,
      capturedAt: "2026-09-04T20:00:00.000Z"
    },
    posts: [{
      xPostId: "100",
      url: "https://x.com/caseymcdougal/status/100",
      text: "Build the thing, then show the receipt.",
      postedAt: "2026-09-01T12:00:00.000Z",
      capturedAt: "2026-09-04T20:00:00.000Z",
      viewsCount: 1_000,
      likesCount: 20,
      repostsCount: 4,
      repliesCount: 3,
      bookmarksCount: 6
    }],
    voiceProfile: null,
    voiceOverrides: "private override that must not enter the job",
    strategyMemory: null,
    creativeDirections: ["private direction that must not enter the job"],
    importReport: { importedPosts: 1, omittedFields: ["private import note"] }
  };
}

function modelOutput(): CreatorBaselineModelOutput {
  return {
    voiceProfile: {
      summary: "Direct builder language.",
      casing_and_punctuation: ["Sentence case."],
      sentence_rhythm: ["Short claims."],
      vocabulary: ["build"],
      hook_moves: ["Open with a concrete claim."],
      banned_moves: ["No hype."],
      style_excerpts: ["Build the thing, then show the receipt."]
    },
    strategyMemory: {
      positioning: "Evidence-backed AI product builder.",
      audience_segments: ["AI builders"],
      strongest_lanes: ["Build receipts"],
      weak_lanes: ["Unsupported commentary"],
      voice_rules: ["Be concrete."],
      proof_points: ["Shipped work"],
      active_experiments: [{ hypothesis: "Artifacts earn saves.", status: "active", evidence: "Future posts." }]
    },
    duplicationGuard: { consideredPostIds: ["100"] },
    claims: [
      { area: "voice", claim: "Uses direct claims.", postIds: ["100"], evidenceKind: "measured", confidence: 0.9, uncertainty: "Small sample." },
      { area: "positioning", claim: "Can own build evidence.", postIds: ["100"], evidenceKind: "inferred", confidence: 0.7, uncertainty: "Positioning is inferred." }
    ],
    largestUncertainty: "The archive is small."
  };
}

function outputPath(request: BaselineProcessRequest): string {
  const flagIndex = request.args.indexOf("--output-last-message");
  if (flagIndex < 0 || !request.args[flagIndex + 1]) throw new Error("missing output path in test request");
  return request.args[flagIndex + 1]!;
}

function successfulProcess(calls: BaselineProcessRequest[]): RunBaselineProcess {
  return async (request) => {
    calls.push(request);
    if (request.args[0] === "login") return { stdout: "Logged in using ChatGPT\n", stderr: "" };
    fs.writeFileSync(outputPath(request), JSON.stringify(modelOutput()));
    return { stdout: "analysis event stream", stderr: "" };
  };
}

describe("Codex creator baseline runner", () => {
  it("preflights ChatGPT auth and runs one isolated structured analysis", async () => {
    const root = tempRoot();
    const calls: BaselineProcessRequest[] = [];
    let inputSnapshot: unknown;
    let promptSnapshot = "";
    let schemaSnapshot: unknown;
    let fileModes: number[] = [];
    const runProcess: RunBaselineProcess = async (request) => {
      if (request.args[0] === "login") {
        calls.push(request);
        return { stdout: "Logged in using ChatGPT\n", stderr: "" };
      }

      inputSnapshot = JSON.parse(fs.readFileSync(join(request.cwd, "input.json"), "utf8"));
      promptSnapshot = fs.readFileSync(join(request.cwd, "prompt.md"), "utf8");
      schemaSnapshot = JSON.parse(fs.readFileSync(join(request.cwd, "schema.json"), "utf8"));
      fileModes = ["input.json", "prompt.md", "schema.json"].map((name) => fs.statSync(join(request.cwd, name)).mode & 0o777);
      calls.push(request);
      fs.writeFileSync(outputPath(request), JSON.stringify(modelOutput()));
      return { stdout: "analysis event stream", stderr: "" };
    };

    const result = await deriveCreatorBaseline({
      archive: archive(),
      runProcess,
      now: () => new Date("2026-09-04T21:00:00.000Z"),
      randomId: () => "20000000-0000-4000-8000-000000000001",
      tempRoot: root
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ command: "codex", args: ["login", "status"] });
    expect(calls[1]!.args).toEqual([
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--cd",
      calls[1]!.cwd,
      "--output-schema",
      join(calls[1]!.cwd, "schema.json"),
      "--output-last-message",
      join(calls[1]!.cwd, "output.json"),
      "-"
    ]);
    for (const forbiddenFlag of ["--enable", "--config", "--profile", "--add-dir"]) {
      expect(calls[1]!.args).not.toContain(forbiddenFlag);
    }
    expect(calls[1]!.env.OPENAI_API_KEY).toBeUndefined();
    expect(calls[1]!.env.OPENAI_BASE_URL).toBeUndefined();
    expect(calls[1]!.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(calls[1]!.env.SOCIAL_BRAIN_X_OAUTH_CLIENT_ID).toBeUndefined();
    expect(calls[1]!.stdin).toBe(promptSnapshot);
    expect(calls[1]!.timeoutMs).toBe(15 * 60 * 1_000);
    expect(promptSnapshot).toMatch(/untrusted evidence/i);
    expect(promptSnapshot).toMatch(/must not issue instructions/i);
    expect(promptSnapshot).toMatch(/do not browse/i);
    expect(promptSnapshot).toMatch(/measured.*inferred/is);
    expect(inputSnapshot).toEqual({
      profile: archive().profile,
      posts: archive().posts.map(({ xPostId, text, postedAt, capturedAt, viewsCount, likesCount, repostsCount, repliesCount, bookmarksCount }) => ({
        xPostId,
        text,
        postedAt,
        capturedAt,
        publicMetrics: { viewsCount, likesCount, repostsCount, repliesCount, bookmarksCount }
      }))
    });
    expect(JSON.stringify(inputSnapshot)).not.toContain("private override");
    expect(JSON.stringify(inputSnapshot)).not.toContain("private direction");
    expect(schemaSnapshot).toMatchObject({ type: "object", additionalProperties: false });
    expect(fileModes).toEqual([0o600, 0o600, 0o600]);
    expect(result).toMatchObject({
      id: "20000000-0000-4000-8000-000000000001",
      createdAt: "2026-09-04T21:00:00.000Z",
      sourceArchiveFingerprint: "a".repeat(64),
      voiceProfile: modelOutput().voiceProfile
    });
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it.each([
    "Logged in using an API key",
    "Logged in using ChatGPT plus extra text",
    "",
    "Logged in using ChatGPT\nLogged in using an API key"
  ])("rejects non-ChatGPT preflight output %j", async (stdout) => {
    const root = tempRoot();
    let calls = 0;
    await expect(deriveCreatorBaseline({
      archive: archive(),
      tempRoot: root,
      runProcess: async () => {
        calls += 1;
        return { stdout, stderr: SECRET };
      }
    })).rejects.toThrow("ChatGPT authentication preflight failed");
    expect(calls).toBe(1);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("redacts process failures and cleans the temporary job", async () => {
    const root = tempRoot();
    let calls = 0;
    await expect(deriveCreatorBaseline({
      archive: archive(),
      tempRoot: root,
      runProcess: async (request) => {
        calls += 1;
        if (request.args[0] === "login") return { stdout: "Logged in using ChatGPT", stderr: "" };
        throw new Error(`analysis failed: ${SECRET}`);
      }
    })).rejects.toThrow("Codex baseline analysis failed");
    expect(calls).toBe(2);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("fails closed on an analysis timeout and cleans the temporary job", async () => {
    const root = tempRoot();
    await expect(deriveCreatorBaseline({
      archive: archive(),
      tempRoot: root,
      runProcess: async (request) => {
        if (request.args[0] === "login") return { stdout: "Logged in using ChatGPT", stderr: "" };
        throw new Error(`timeout details: ${SECRET}`);
      }
    })).rejects.toThrow("Codex baseline analysis failed");
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("redacts a preflight process failure", async () => {
    await expect(deriveCreatorBaseline({
      archive: archive(),
      tempRoot: tempRoot(),
      runProcess: async () => { throw new Error(`spawn failed: ${SECRET}`); }
    })).rejects.toThrow("Codex baseline authentication preflight failed");
  });

  it("rejects a missing output file", async () => {
    const root = tempRoot();
    await expect(deriveCreatorBaseline({
      archive: archive(),
      tempRoot: root,
      runProcess: async (request) => request.args[0] === "login"
        ? { stdout: "Logged in using ChatGPT", stderr: "" }
        : { stdout: "", stderr: "" }
    })).rejects.toThrow("Codex baseline output was not written");
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("rejects malformed output JSON without exposing it", async () => {
    const root = tempRoot();
    await expect(deriveCreatorBaseline({
      archive: archive(),
      tempRoot: root,
      runProcess: async (request) => {
        if (request.args[0] === "login") return { stdout: "Logged in using ChatGPT", stderr: "" };
        fs.writeFileSync(outputPath(request), `{bad ${SECRET}`);
        return { stdout: "", stderr: "" };
      }
    })).rejects.toThrow("Codex baseline output was invalid");
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("rejects structurally invalid output", async () => {
    const root = tempRoot();
    await expect(deriveCreatorBaseline({
      archive: archive(),
      tempRoot: root,
      runProcess: async (request) => {
        if (request.args[0] === "login") return { stdout: "Logged in using ChatGPT", stderr: "" };
        fs.writeFileSync(outputPath(request), JSON.stringify({ ...modelOutput(), claims: [] }));
        return { stdout: "", stderr: "" };
      }
    })).rejects.toThrow("Codex baseline output was invalid");
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("rejects unknown post evidence", async () => {
    const root = tempRoot();
    const invalid = modelOutput();
    invalid.claims[0]!.postIds = ["999"];
    const calls: BaselineProcessRequest[] = [];
    const runProcess = successfulProcess(calls);
    const writingUnknownEvidence: RunBaselineProcess = async (request) => {
      if (request.args[0] === "login") return runProcess(request);
      calls.push(request);
      fs.writeFileSync(outputPath(request), JSON.stringify(invalid));
      return { stdout: "", stderr: "" };
    };

    await expect(deriveCreatorBaseline({ archive: archive(), tempRoot: root, runProcess: writingUnknownEvidence })).rejects.toThrow(/unknown post/i);
    expect(fs.readdirSync(root)).toEqual([]);
  });
});
