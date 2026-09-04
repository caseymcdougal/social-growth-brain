import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readLocalCreatorArchive,
  writeLocalCreatorArchive
} from "../../../src/brain/import/local-creator-archive";
import type { CreatorArchive } from "../../../src/brain/domain/creator-archive";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

function archive(source: CreatorArchive["source"] = "x-api-owned-posts"): CreatorArchive {
  return {
    schemaVersion: 1, id: "00000000-0000-4000-8000-000000000001", creatorId: "casey-mcdougal",
    source, consentBasis: source === "x-api-owned-posts" ? "casey-approved-x-owned-post-import" : "casey-requested-import",
    consentRecordedAt: "2026-09-01T00:00:00.000Z", sourceFingerprint: "a".repeat(64), importedAt: "2026-09-01T00:00:00.000Z",
    profile: null, posts: [], voiceProfile: null, voiceOverrides: "", strategyMemory: null, creativeDirections: [],
    importReport: { importedPosts: 0, omittedFields: [] }
  };
}

function pathFor(dir = mkdtempSync(join(fs.realpathSync(tmpdir()), "local-archive-"))) { dirs.push(dir); return join(dir, "nested", "archive.json"); }

describe("local creator archive", () => {
  it("returns null when the archive is absent", () => expect(readLocalCreatorArchive(pathFor())).toBeNull());

  it("writes and reads an owned archive with private file permissions", () => {
    const path = pathFor(); const input = archive();
    expect(writeLocalCreatorArchive(path, input)).toEqual(input);
    expect(readLocalCreatorArchive(path)).toEqual(input);
    expect(fs.statSync(path).mode & 0o777).toBe(0o600);
    expect(fs.statSync(dirname(path)).mode & 0o777).toBe(0o700);
  });

  it("rejects mismatched source and consent pairs", () => {
    expect(() => writeLocalCreatorArchive(pathFor(), { ...archive(), consentBasis: "casey-requested-import" })).toThrow();
    expect(() => writeLocalCreatorArchive(pathFor(), { ...archive("legacy-sqlite"), consentBasis: "casey-approved-x-owned-post-import" })).toThrow();
  });

  it("rejects symlinks, malformed JSON, and non-owned archives", () => {
    const path = pathFor(); fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, "{bad"); expect(() => readLocalCreatorArchive(path)).toThrow();
    fs.rmSync(path); fs.writeFileSync(path, JSON.stringify(archive("legacy-sqlite")));
    expect(() => readLocalCreatorArchive(path)).toThrow(/owned/);
    const target = pathFor(); writeLocalCreatorArchive(target, archive()); const link = `${target}.link`; fs.symlinkSync(target, link);
    expect(() => readLocalCreatorArchive(link)).toThrow(/symlink/);
    const directory = pathFor(); fs.mkdirSync(directory, { recursive: true });
    expect(() => readLocalCreatorArchive(directory)).toThrow(/regular file/);
    const parent = pathFor(); fs.rmSync(dirname(parent), { recursive: true, force: true }); fs.symlinkSync(tmpdir(), dirname(parent));
    expect(() => writeLocalCreatorArchive(parent, archive())).toThrow(/symlink/);
  });

  it("rejects a read through a symlinked parent directory", () => {
    const path = pathFor(); writeLocalCreatorArchive(path, archive());
    const parent = dirname(path); const target = mkdtempSync(join(fs.realpathSync(tmpdir()), "local-archive-target-")); dirs.push(target);
    fs.rmSync(parent, { recursive: true, force: true }); fs.symlinkSync(target, parent);
    expect(() => readLocalCreatorArchive(path)).toThrow(/symlink/);
  });

  it("rejects a FIFO without blocking", () => {
    const path = pathFor(); fs.mkdirSync(dirname(path), { recursive: true }); execFileSync("mkfifo", [path]);
    expect(() => readLocalCreatorArchive(path)).toThrow(/regular file/);
  });

  it("rejects final symlink and FIFO paths when writing", () => {
    const target = pathFor(); writeLocalCreatorArchive(target, archive());
    const link = `${target}.link`; fs.symlinkSync(target, link);
    expect(() => writeLocalCreatorArchive(link, archive())).toThrow(/symlink/);
    const fifo = `${target}.fifo`; execFileSync("mkfifo", [fifo]);
    expect(() => writeLocalCreatorArchive(fifo, archive())).toThrow(/regular file/);
    expect(readLocalCreatorArchive(target)).toEqual(archive());
  });

  it("preserves the prior archive when an invalid write is attempted", () => {
    const path = pathFor(); const prior = archive(); writeLocalCreatorArchive(path, prior);
    expect(() => writeLocalCreatorArchive(path, archive("legacy-sqlite"))).toThrow(/owned/);
    expect(readLocalCreatorArchive(path)).toEqual(prior);
  });

  it("keeps exact file permissions under a restrictive umask", () => {
    const path = pathFor(); const previous = process.umask(0o077);
    try { writeLocalCreatorArchive(path, archive()); }
    finally { process.umask(previous); }
    expect(fs.statSync(path).mode & 0o777).toBe(0o600);
  });

  it("makes an existing archive parent private", () => {
    const dir = mkdtempSync(join(fs.realpathSync(tmpdir()), "local-archive-parent-")); dirs.push(dir);
    const path = join(dir, "archive.json"); fs.chmodSync(dir, 0o755);
    writeLocalCreatorArchive(path, archive());
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
  });

  it("removes only its temp file when atomic replacement fails", () => {
    const path = pathFor(); const prior = archive(); writeLocalCreatorArchive(path, prior); let temporary: string | undefined;
    const spy = vi.spyOn(fs, "renameSync").mockImplementation(((from: fs.PathLike) => {
      temporary = String(from); throw new Error("rename failed");
    }) as typeof fs.renameSync);
    try { expect(() => writeLocalCreatorArchive(path, archive())).toThrow("rename failed"); }
    finally { spy.mockRestore(); }
    expect(readLocalCreatorArchive(path)).toEqual(prior); expect(temporary).toBeDefined(); expect(fs.existsSync(temporary!)).toBe(false);
  });

  it("does not remove a pre-existing temp file after a name collision", () => {
    const path = pathFor(); let collision: string | undefined;
    const originalOpen = fs.openSync;
    const spy = vi.spyOn(fs, "openSync").mockImplementation(((filePath: fs.PathLike, flags: string | number, mode?: number) => {
      if ((typeof flags === "number" && (flags & fs.constants.O_EXCL)) !== 0) {
        collision = String(filePath); fs.writeFileSync(collision, "keep me");
        const error = new Error("collision") as NodeJS.ErrnoException; error.code = "EEXIST"; throw error;
      }
      return originalOpen(filePath, flags, mode);
    }) as typeof fs.openSync);
    try { expect(() => writeLocalCreatorArchive(path, archive())).toThrow("collision"); }
    finally { spy.mockRestore(); }
    expect(collision).toBeDefined(); expect(fs.readFileSync(collision!, "utf8")).toBe("keep me");
  });
});
