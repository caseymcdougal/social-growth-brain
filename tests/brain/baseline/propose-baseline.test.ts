import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proposeCreatorBaseline } from "../../../src/brain/baseline/propose-baseline";
import { writeLocalCreatorArchive } from "../../../src/brain/import/local-creator-archive";
import {
  buildCreatorBaselineProposal,
  type CreatorArchive,
  type CreatorBaselineModelOutput,
  type CreatorBaselineProposal
} from "../../../src/brain/domain";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function paths() {
  const directory = mkdtempSync(join(fs.realpathSync(tmpdir()), "propose-baseline-"));
  directories.push(directory);
  return {
    directory,
    archivePath: join(directory, "archive.json"),
    proposalPath: join(directory, "proposal.json"),
    acceptedPath: join(directory, "accepted.json")
  };
}

function archive(overrides: Partial<CreatorArchive> = {}): CreatorArchive {
  return {
    schemaVersion: 1,
    id: "10000000-0000-4000-8000-000000000001",
    creatorId: "casey-mcdougal",
    source: "x-api-owned-posts",
    consentBasis: "casey-approved-x-owned-post-import",
    consentRecordedAt: "2026-09-04T20:00:00.000Z",
    sourceFingerprint: "a".repeat(64),
    importedAt: "2026-09-04T20:01:00.000Z",
    profile: null,
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
    voiceOverrides: "",
    strategyMemory: null,
    creativeDirections: [],
    importReport: { importedPosts: 1, omittedFields: [] },
    ...overrides
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

function deriveProposal(inputArchive: CreatorArchive): CreatorBaselineProposal {
  return buildCreatorBaselineProposal({
    archive: inputArchive,
    modelOutput: modelOutput(),
    id: "20000000-0000-4000-8000-000000000001",
    now: () => new Date("2026-09-04T21:00:00.000Z")
  });
}

describe("proposeCreatorBaseline", () => {
  it("derives and writes a proposal without changing archive bytes", async () => {
    const fixture = paths();
    writeLocalCreatorArchive(fixture.archivePath, archive());
    const beforeBytes = fs.readFileSync(fixture.archivePath);
    const derive = vi.fn(async ({ archive: inputArchive }: { archive: CreatorArchive }) => deriveProposal(inputArchive));
    const written: Array<{ path: string; proposal: CreatorBaselineProposal }> = [];
    const writeProposal = vi.fn((path: string, proposal: CreatorBaselineProposal) => {
      written.push({ path, proposal });
      return proposal;
    });

    const result = await proposeCreatorBaseline({
      archivePath: fixture.archivePath,
      proposalPath: fixture.proposalPath,
      derive,
      writeProposal
    });

    expect(derive).toHaveBeenCalledOnce();
    expect(writeProposal).toHaveBeenCalledOnce();
    expect(written).toEqual([{ path: fixture.proposalPath, proposal: result }]);
    expect(result.sourceArchiveFingerprint).toBe(archive().sourceFingerprint);
    expect(fs.readFileSync(fixture.archivePath)).toEqual(beforeBytes);
    expect(fs.existsSync(fixture.acceptedPath)).toBe(false);
  });

  it("does not persist when archive bytes change during analysis", async () => {
    const fixture = paths();
    writeLocalCreatorArchive(fixture.archivePath, archive());
    const writeProposal = vi.fn();

    await expect(proposeCreatorBaseline({
      archivePath: fixture.archivePath,
      proposalPath: fixture.proposalPath,
      derive: async ({ archive: inputArchive }) => {
        fs.appendFileSync(fixture.archivePath, "\n");
        return deriveProposal(inputArchive);
      },
      writeProposal
    })).rejects.toThrow("Owned X archive changed during baseline analysis");

    expect(writeProposal).not.toHaveBeenCalled();
    expect(fs.existsSync(fixture.proposalPath)).toBe(false);
  });

  it("rejects an absent archive before derivation", async () => {
    const fixture = paths();
    const derive = vi.fn();
    await expect(proposeCreatorBaseline({ archivePath: fixture.archivePath, derive })).rejects.toThrow(/not found/i);
    expect(derive).not.toHaveBeenCalled();
  });

  it("rejects an empty owned archive before derivation", async () => {
    const fixture = paths();
    writeLocalCreatorArchive(fixture.archivePath, archive({ posts: [], importReport: { importedPosts: 0, omittedFields: [] } }));
    const derive = vi.fn();
    await expect(proposeCreatorBaseline({ archivePath: fixture.archivePath, derive })).rejects.toThrow(/at least one post/i);
    expect(derive).not.toHaveBeenCalled();
  });

  it("rejects a non-owned archive before derivation", async () => {
    const fixture = paths();
    const legacy = archive({ source: "legacy-sqlite", consentBasis: "casey-requested-import" });
    fs.writeFileSync(fixture.archivePath, JSON.stringify(legacy));
    const derive = vi.fn();
    await expect(proposeCreatorBaseline({ archivePath: fixture.archivePath, derive })).rejects.toThrow(/owned X/i);
    expect(derive).not.toHaveBeenCalled();
  });

  it("rejects an invalid derived proposal before persistence", async () => {
    const fixture = paths();
    writeLocalCreatorArchive(fixture.archivePath, archive());
    const writeProposal = vi.fn();
    const invalid = { ...deriveProposal(archive()), sourceArchiveFingerprint: "b".repeat(64) };

    await expect(proposeCreatorBaseline({
      archivePath: fixture.archivePath,
      derive: async () => invalid,
      writeProposal
    })).rejects.toThrow(/fingerprint/i);
    expect(writeProposal).not.toHaveBeenCalled();
  });

  it("fails closed on archive read errors", async () => {
    const fixture = paths();
    fs.mkdirSync(fixture.archivePath);
    const derive = vi.fn();
    await expect(proposeCreatorBaseline({ archivePath: fixture.archivePath, derive })).rejects.toThrow(/regular file/i);
    expect(derive).not.toHaveBeenCalled();
  });
});
