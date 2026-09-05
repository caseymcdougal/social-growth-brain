import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptLocalCreatorBaseline,
  parseBaselineAcceptArgs
} from "../../../src/brain/baseline/accept-baseline";
import { runBaselineAcceptCli } from "../../../src/brain/baseline/accept-cli";
import { runBaselineProposalCli } from "../../../src/brain/baseline/propose-cli";
import {
  readLocalAcceptedBaseline,
  writeLocalAcceptedBaseline,
  writeLocalBaselineProposal
} from "../../../src/brain/baseline/local-baseline-store";
import { writeLocalCreatorArchive } from "../../../src/brain/import/local-creator-archive";
import {
  acceptCreatorBaseline,
  buildCreatorBaselineProposal,
  type AcceptedCreatorBaseline,
  type CreatorArchive,
  type CreatorBaselineModelOutput,
  type CreatorBaselineProposal
} from "../../../src/brain/domain";

const PROPOSAL_ID = "20000000-0000-4000-8000-000000000001";
const FINGERPRINT = "a".repeat(64);
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function paths() {
  const directory = mkdtempSync(join(fs.realpathSync(tmpdir()), "baseline-cli-"));
  directories.push(directory);
  return {
    archivePath: join(directory, "archive.json"),
    proposalPath: join(directory, "proposal.json"),
    acceptedPath: join(directory, "accepted.json")
  };
}

function archive(sourceFingerprint = FINGERPRINT): CreatorArchive {
  return {
    schemaVersion: 1,
    id: "10000000-0000-4000-8000-000000000001",
    creatorId: "casey-mcdougal",
    source: "x-api-owned-posts",
    consentBasis: "casey-approved-x-owned-post-import",
    consentRecordedAt: "2026-09-04T20:00:00.000Z",
    sourceFingerprint,
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
    importReport: { importedPosts: 1, omittedFields: [] }
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

function proposal(): CreatorBaselineProposal {
  return buildCreatorBaselineProposal({
    archive: archive(),
    modelOutput: modelOutput(),
    id: PROPOSAL_ID,
    now: () => new Date("2026-09-04T21:00:00.000Z")
  });
}

function accepted(): AcceptedCreatorBaseline {
  const current = proposal();
  return acceptCreatorBaseline({
    archive: archive(),
    proposal: current,
    proposalId: current.id,
    sourceFingerprint: current.sourceArchiveFingerprint,
    now: () => new Date("2026-09-04T22:00:00.000Z")
  });
}

function writer(output: string[]) {
  return { write(text: string) { output.push(text); return true; } };
}

describe("baseline approval arguments", () => {
  it("parses only the exact proposal ID and lowercase source fingerprint form", () => {
    expect(parseBaselineAcceptArgs(["--proposal-id", PROPOSAL_ID, "--source-fingerprint", FINGERPRINT])).toEqual({
      proposalId: PROPOSAL_ID,
      sourceFingerprint: FINGERPRINT
    });
  });

  it.each([
    { args: [] },
    { args: ["--source-fingerprint", FINGERPRINT, "--proposal-id", PROPOSAL_ID] },
    { args: ["--proposal-id", PROPOSAL_ID] },
    { args: ["--proposal-id", PROPOSAL_ID, "--source-fingerprint", FINGERPRINT, "extra"] },
    { args: ["--proposal-id", PROPOSAL_ID, "--proposal-id", PROPOSAL_ID] },
    { args: ["--proposal-id", "not-a-uuid", "--source-fingerprint", FINGERPRINT] },
    { args: ["--proposal-id", PROPOSAL_ID, "--source-fingerprint", FINGERPRINT.toUpperCase()] }
  ])("rejects invalid acceptance arguments %#", ({ args }) => {
    expect(() => parseBaselineAcceptArgs(args)).toThrow(/Usage|proposal|fingerprint/i);
  });
});

describe("baseline CLIs", () => {
  it("prints only proposal metadata and invokes proposal generation once", async () => {
    const stdout: string[] = [];
    const propose = vi.fn(async () => proposal());

    await runBaselineProposalCli({ args: [], stdout: writer(stdout), propose });

    expect(propose).toHaveBeenCalledOnce();
    expect(stdout.join("")).toBe(`${PROPOSAL_ID}\n${FINGERPRINT}\n2\n`);
    expect(stdout.join("")).not.toContain("Direct builder language");
  });

  it("rejects proposal arguments before invoking generation", async () => {
    const propose = vi.fn();
    await expect(runBaselineProposalCli({ args: ["unexpected"], propose })).rejects.toThrow(/Usage/i);
    expect(propose).not.toHaveBeenCalled();
  });

  it("prints only accepted metadata and invokes acceptance once", () => {
    const stdout: string[] = [];
    const accept = vi.fn(() => accepted());

    runBaselineAcceptCli({
      args: ["--proposal-id", PROPOSAL_ID, "--source-fingerprint", FINGERPRINT],
      stdout: writer(stdout),
      accept
    });

    expect(accept).toHaveBeenCalledWith({ proposalId: PROPOSAL_ID, sourceFingerprint: FINGERPRINT });
    expect(stdout.join("")).toBe(`${PROPOSAL_ID}\n${FINGERPRINT}\n2026-09-04T22:00:00.000Z\n`);
    expect(stdout.join("")).not.toContain("Direct builder language");
  });
});

describe("acceptLocalCreatorBaseline", () => {
  it("reloads exact archive and proposal state before writing acceptance", () => {
    const fixture = paths();
    writeLocalCreatorArchive(fixture.archivePath, archive());
    writeLocalBaselineProposal(fixture.proposalPath, proposal());

    const result = acceptLocalCreatorBaseline({
      proposalId: PROPOSAL_ID,
      sourceFingerprint: FINGERPRINT,
      archivePath: fixture.archivePath,
      proposalPath: fixture.proposalPath,
      acceptedPath: fixture.acceptedPath,
      now: () => new Date("2026-09-04T22:00:00.000Z")
    });

    expect(result.acceptedProposalId).toBe(PROPOSAL_ID);
    expect(readLocalAcceptedBaseline(fixture.acceptedPath)).toEqual(result);
  });

  it("rejects stale identifiers without changing an existing accepted baseline", () => {
    const fixture = paths();
    writeLocalCreatorArchive(fixture.archivePath, archive());
    writeLocalBaselineProposal(fixture.proposalPath, proposal());
    writeLocalAcceptedBaseline(fixture.acceptedPath, accepted());
    const before = fs.readFileSync(fixture.acceptedPath);

    expect(() => acceptLocalCreatorBaseline({
      proposalId: "30000000-0000-4000-8000-000000000001",
      sourceFingerprint: FINGERPRINT,
      archivePath: fixture.archivePath,
      proposalPath: fixture.proposalPath,
      acceptedPath: fixture.acceptedPath
    })).toThrow(/proposal/i);
    expect(fs.readFileSync(fixture.acceptedPath)).toEqual(before);

    expect(() => acceptLocalCreatorBaseline({
      proposalId: PROPOSAL_ID,
      sourceFingerprint: "b".repeat(64),
      archivePath: fixture.archivePath,
      proposalPath: fixture.proposalPath,
      acceptedPath: fixture.acceptedPath
    })).toThrow(/fingerprint/i);
    expect(fs.readFileSync(fixture.acceptedPath)).toEqual(before);
  });

  it("rejects an archive changed after proposal generation", () => {
    const fixture = paths();
    writeLocalCreatorArchive(fixture.archivePath, archive("b".repeat(64)));
    writeLocalBaselineProposal(fixture.proposalPath, proposal());

    expect(() => acceptLocalCreatorBaseline({
      proposalId: PROPOSAL_ID,
      sourceFingerprint: FINGERPRINT,
      archivePath: fixture.archivePath,
      proposalPath: fixture.proposalPath,
      acceptedPath: fixture.acceptedPath
    })).toThrow(/archive/i);
    expect(fs.existsSync(fixture.acceptedPath)).toBe(false);
  });

  it("rejects missing archive and proposal files", () => {
    const fixture = paths();
    expect(() => acceptLocalCreatorBaseline({
      proposalId: PROPOSAL_ID,
      sourceFingerprint: FINGERPRINT,
      archivePath: fixture.archivePath,
      proposalPath: fixture.proposalPath,
      acceptedPath: fixture.acceptedPath
    })).toThrow(/archive/i);

    writeLocalCreatorArchive(fixture.archivePath, archive());
    expect(() => acceptLocalCreatorBaseline({
      proposalId: PROPOSAL_ID,
      sourceFingerprint: FINGERPRINT,
      archivePath: fixture.archivePath,
      proposalPath: fixture.proposalPath,
      acceptedPath: fixture.acceptedPath
    })).toThrow(/proposal/i);
  });
});
