import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { creatorArchiveSchema, type CreatorArchive } from "../domain/creator-archive";

export const DEFAULT_OWNED_X_ARCHIVE_PATH = resolve("data/social-brain/casey-owned-post-history.json");

function ownedArchive(input: unknown): CreatorArchive {
  const archive = creatorArchiveSchema.parse(input);
  if (archive.source !== "x-api-owned-posts") throw new Error("Creator archive must use an owned X source");
  return archive;
}

function assertRegularFinalPath(path: string): void {
  try {
    const stat = fs.lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("Creator archive path must not be a symlink");
    if (!stat.isFile()) throw new Error("Creator archive path must be a regular file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function ensurePrivateParent(parent: string): void {
  const absolute = resolve(parent);
  const segments = absolute.split("/");
  let current = segments[0] === "" ? "/" : segments.shift()!;
  for (const segment of segments) {
    if (!segment) continue;
    current = current === "/" ? `/${segment}` : `${current}/${segment}`;
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) {
        throw new Error("Creator archive parent must not contain symlinks");
      }
      if (!stat.isDirectory()) throw new Error("Creator archive parent must contain only directories");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      fs.mkdirSync(current, { mode: 0o700 });
      const created = fs.lstatSync(current);
      if (!created.isDirectory() || created.isSymbolicLink()) throw new Error("Creator archive parent must be a real directory");
      fs.chmodSync(current, 0o700);
    }
  }
  const finalParent = fs.lstatSync(absolute);
  if (finalParent.isSymbolicLink() || !finalParent.isDirectory()) throw new Error("Creator archive parent must be a real directory");
  fs.chmodSync(absolute, 0o700);
}

function validateExistingParent(parent: string): void {
  const absolute = resolve(parent);
  const segments = absolute.split("/");
  let current = segments[0] === "" ? "/" : segments.shift()!;
  for (const segment of segments) {
    if (!segment) continue;
    current = current === "/" ? `/${segment}` : `${current}/${segment}`;
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error("Creator archive parent must not contain symlinks");
      if (!stat.isDirectory()) throw new Error("Creator archive parent must contain only directories");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

export function readLocalCreatorArchive(path = DEFAULT_OWNED_X_ARCHIVE_PATH): CreatorArchive | null {
  let fd: number | undefined;
  try {
    validateExistingParent(dirname(path));
    fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error("Creator archive path must be a regular file");
    return ownedArchive(JSON.parse(fs.readFileSync(fd, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if ((error as NodeJS.ErrnoException).code === "ELOOP") throw new Error("Creator archive path must not be a symlink");
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function writeLocalCreatorArchive(path: string, input: CreatorArchive): CreatorArchive {
  const archive = ownedArchive(input);
  const parent = dirname(path);
  ensurePrivateParent(parent);
  assertRegularFinalPath(path);

  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  let temporaryCreated = false;
  try {
    fd = fs.openSync(temporaryPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    temporaryCreated = true;
    fs.fchmodSync(fd, 0o600);
    fs.writeFileSync(fd, JSON.stringify(archive));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporaryPath, path);
    return archive;
  } catch (error) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    if (temporaryCreated) {
      try { fs.unlinkSync(temporaryPath); } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    throw error;
  }
}
