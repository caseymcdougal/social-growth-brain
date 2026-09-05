import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readLocalAcceptedBaseline,
  readLocalBaselineProposal,
  writeLocalAcceptedBaseline,
  writeLocalBaselineProposal
} from "../../../src/brain/baseline/local-baseline-store";
import {
  acceptCreatorBaseline,
  buildCreatorBaselineProposal,
  type AcceptedCreatorBaseline,
  type CreatorArchive,
  type CreatorBaselineModelOutput,
  type CreatorBaselineProposal
} from "../../../src/brain/domain";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function privatePath(name: string): string {
  const directory = mkdtempSync(join(fs.realpathSync(tmpdir()), "local-baseline-"));
  directories.push(directory);
  return join(directory, "nested", name);
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
    id: "20000000-0000-4000-8000-000000000001",
    now: () => new Date("2026-09-04T21:00:00.000Z")
  });
}

function accepted(): AcceptedCreatorBaseline {
  const input = proposal();
  return acceptCreatorBaseline({
    archive: archive(),
    proposal: input,
    proposalId: input.id,
    sourceFingerprint: input.sourceArchiveFingerprint,
    now: () => new Date("2026-09-04T22:00:00.000Z")
  });
}

describe("local creator baseline store", () => {
  it("returns null only when proposal and accepted files are absent", () => {
    expect(readLocalBaselineProposal(privatePath("proposal.json"))).toBeNull();
    expect(readLocalAcceptedBaseline(privatePath("accepted.json"))).toBeNull();
  });

  it("writes and reads both records with private permissions", () => {
    const proposalPath = privatePath("proposal.json");
    const acceptedPath = privatePath("accepted.json");

    expect(writeLocalBaselineProposal(proposalPath, proposal())).toEqual(proposal());
    expect(readLocalBaselineProposal(proposalPath)).toEqual(proposal());
    expect(fs.statSync(proposalPath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(dirname(proposalPath)).mode & 0o777).toBe(0o700);

    expect(writeLocalAcceptedBaseline(acceptedPath, accepted())).toEqual(accepted());
    expect(readLocalAcceptedBaseline(acceptedPath)).toEqual(accepted());
    expect(fs.statSync(acceptedPath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(dirname(acceptedPath)).mode & 0o777).toBe(0o700);
  });

  it("rejects malformed JSON and invalid record schemas", () => {
    const proposalPath = privatePath("proposal.json");
    fs.mkdirSync(dirname(proposalPath), { recursive: true });
    fs.writeFileSync(proposalPath, "{bad");
    expect(() => readLocalBaselineProposal(proposalPath)).toThrow();

    const acceptedPath = privatePath("accepted.json");
    fs.mkdirSync(dirname(acceptedPath), { recursive: true });
    fs.writeFileSync(acceptedPath, JSON.stringify({ ...accepted(), acceptedBy: "someone-else" }));
    expect(() => readLocalAcceptedBaseline(acceptedPath)).toThrow();
  });

  it("rejects final symlinks and directories when reading", () => {
    const target = privatePath("proposal.json");
    writeLocalBaselineProposal(target, proposal());
    const link = `${target}.link`;
    fs.symlinkSync(target, link);
    expect(() => readLocalBaselineProposal(link)).toThrow(/symlink/i);

    const directory = privatePath("directory");
    fs.mkdirSync(directory, { recursive: true });
    expect(() => readLocalBaselineProposal(directory)).toThrow(/regular file/i);
  });

  it("rejects reads and writes through symlinked parents", () => {
    const path = privatePath("proposal.json");
    const parent = dirname(path);
    fs.rmSync(parent, { recursive: true, force: true });
    fs.symlinkSync(tmpdir(), parent);

    expect(() => readLocalBaselineProposal(path)).toThrow(/symlink/i);
    expect(() => writeLocalBaselineProposal(path, proposal())).toThrow(/symlink/i);
  });

  it("rejects a FIFO without blocking", () => {
    const path = privatePath("proposal.fifo");
    fs.mkdirSync(dirname(path), { recursive: true });
    execFileSync("mkfifo", [path]);
    expect(() => readLocalBaselineProposal(path)).toThrow(/regular file/i);
  });

  it("rejects final symlink and FIFO paths when writing", () => {
    const target = privatePath("proposal.json");
    writeLocalBaselineProposal(target, proposal());
    const link = `${target}.link`;
    fs.symlinkSync(target, link);
    expect(() => writeLocalBaselineProposal(link, proposal())).toThrow(/symlink/i);

    const fifo = `${target}.fifo`;
    execFileSync("mkfifo", [fifo]);
    expect(() => writeLocalBaselineProposal(fifo, proposal())).toThrow(/regular file/i);
    expect(readLocalBaselineProposal(target)).toEqual(proposal());
  });

  it("preserves existing records after invalid writes", () => {
    const proposalPath = privatePath("proposal.json");
    const priorProposal = proposal();
    writeLocalBaselineProposal(proposalPath, priorProposal);
    expect(() => writeLocalBaselineProposal(
      proposalPath,
      { ...proposal(), creatorId: "someone-else" } as unknown as CreatorBaselineProposal
    )).toThrow();
    expect(readLocalBaselineProposal(proposalPath)).toEqual(priorProposal);

    const acceptedPath = privatePath("accepted.json");
    const priorAccepted = accepted();
    writeLocalAcceptedBaseline(acceptedPath, priorAccepted);
    expect(() => writeLocalAcceptedBaseline(acceptedPath, { ...accepted(), acceptedProposalId: "30000000-0000-4000-8000-000000000001" })).toThrow();
    expect(readLocalAcceptedBaseline(acceptedPath)).toEqual(priorAccepted);
  });

  it("keeps exact file permissions under a permissive umask", () => {
    const path = privatePath("proposal.json");
    const previous = process.umask(0o000);
    try {
      writeLocalBaselineProposal(path, proposal());
    } finally {
      process.umask(previous);
    }
    expect(fs.statSync(path).mode & 0o777).toBe(0o600);
    expect(fs.statSync(dirname(path)).mode & 0o777).toBe(0o700);
  });

  it("makes an existing final parent private", () => {
    const directory = mkdtempSync(join(fs.realpathSync(tmpdir()), "local-baseline-parent-"));
    directories.push(directory);
    fs.chmodSync(directory, 0o755);
    const path = join(directory, "proposal.json");

    writeLocalBaselineProposal(path, proposal());

    expect(fs.statSync(directory).mode & 0o777).toBe(0o700);
  });

  it("preserves an existing record and removes its temp file when rename fails", () => {
    const path = privatePath("proposal.json");
    const prior = proposal();
    writeLocalBaselineProposal(path, prior);
    let temporaryPath: string | undefined;
    const rename = vi.spyOn(fs, "renameSync").mockImplementation(((from: fs.PathLike) => {
      temporaryPath = String(from);
      throw new Error("rename failed");
    }) as typeof fs.renameSync);

    try {
      expect(() => writeLocalBaselineProposal(path, proposal())).toThrow("rename failed");
    } finally {
      rename.mockRestore();
    }

    expect(readLocalBaselineProposal(path)).toEqual(prior);
    expect(temporaryPath).toBeDefined();
    expect(fs.existsSync(temporaryPath!)).toBe(false);
  });

  it("does not delete a pre-existing file after a temp-name collision", () => {
    const path = privatePath("proposal.json");
    let collisionPath: string | undefined;
    const originalOpen = fs.openSync;
    const open = vi.spyOn(fs, "openSync").mockImplementation(((filePath: fs.PathLike, flags: string | number, mode?: number) => {
      if (typeof flags === "number" && (flags & fs.constants.O_EXCL) !== 0) {
        collisionPath = String(filePath);
        fs.writeFileSync(collisionPath, "keep me");
        const error = new Error("collision") as NodeJS.ErrnoException;
        error.code = "EEXIST";
        throw error;
      }
      return originalOpen(filePath, flags, mode);
    }) as typeof fs.openSync);

    try {
      expect(() => writeLocalBaselineProposal(path, proposal())).toThrow("collision");
    } finally {
      open.mockRestore();
    }

    expect(collisionPath).toBeDefined();
    expect(fs.readFileSync(collisionPath!, "utf8")).toBe("keep me");
  });
});
