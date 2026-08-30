import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { creatorArchiveSchema, type CreatorArchive } from "../domain";
import { strategyMemorySchema } from "../../shared/strategy-intelligence-schema";
import { voiceProfileSchema } from "../../shared/voice-profile";

const CASEY_HANDLE = "caseymcdougal";
const REQUIRED_TABLES = ["profile_snapshots", "post_snapshots", "voice_profiles", "voice_overrides", "strategy_memories", "strategy_memory_proposals", "creative_direction"];
const FIXED_ID = "00000000-0000-4000-8000-000000000001";
export interface ReadLegacyArchiveOptions { sqlitePath: string; now?: () => Date; }
type Row = Record<string, unknown>;
let captureHookForTest: (() => void) | undefined;
/** @internal Test seam; not part of the reader options/public import API. */
export function __setLegacyCaptureHookForTest(hook: (() => void) | undefined): void { captureHookForTest = hook; }
const requiredText = (value: unknown, field: string) => { if (typeof value !== "string") throw new Error(`Invalid legacy text field: ${field}`); return value; };
const nullableText = (value: unknown, field: string) => value === null ? null : requiredText(value, field);
const metric = (value: unknown, field: string): number | null => { if (value === null) return null; if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value; throw new Error(`Invalid legacy numeric field: ${field}`); };
function parseJson(value: unknown, label: string): unknown { try { return JSON.parse(requiredText(value, `${label}_json`)); } catch { throw new Error(`Invalid archived ${label} JSON`); } }

/** Never opens user-owned SQLite in place. WAL sidecars mean the source is not quiescent and fail closed. */
function capturePrivateSnapshot(sqlitePath: string): { path: string; cleanup(): void } {
  const source = resolve(sqlitePath); const sourceStat = lstatSync(source);
  if (sourceStat.isSymbolicLink()) throw new Error("Legacy SQLite source must not be a symlink");
  if (!sourceStat.isFile()) throw new Error("Legacy SQLite source must be a regular file");
  const assertNoSidecars = () => { for (const suffix of ["-wal", "-shm"]) { try { lstatSync(`${source}${suffix}`); throw new Error("Legacy SQLite source has active WAL sidecars; close and checkpoint it before import"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } } };
  assertNoSidecars();
  const directory = mkdtempSync(join(tmpdir(), "social-brain-legacy-")); const snapshotPath = join(directory, basename(source)); let fd: number | undefined;
  try { fd = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW); const before = fstatSync(fd); if (!before.isFile() || before.dev !== sourceStat.dev || before.ino !== sourceStat.ino) throw new Error("Legacy SQLite source changed before capture; retry after it is quiescent"); writeFileSync(snapshotPath, readFileSync(fd), { mode: 0o600 }); captureHookForTest?.(); const after = fstatSync(fd); const finalPath = lstatSync(source); assertNoSidecars(); if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || finalPath.dev !== before.dev || finalPath.ino !== before.ino) throw new Error("Legacy SQLite source changed while capturing; retry after it is quiescent"); return { path: snapshotPath, cleanup: () => rmSync(directory, { recursive: true, force: true }) }; }
  catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; } finally { if (fd !== undefined) closeSync(fd); }
}

function readSnapshot(snapshotPath: string, now: () => Date): CreatorArchive {
  const db = new Database(snapshotPath, { readonly: true, fileMustExist: true }); let transaction = false;
  try {
    db.pragma("query_only = ON"); db.exec("BEGIN"); transaction = true;
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name)); for (const table of REQUIRED_TABLES) if (!tables.has(table)) throw new Error(`Missing required legacy table: ${table}`);
    const handles = (db.prepare("SELECT DISTINCT lower(trim(handle)) AS handle FROM profile_snapshots").all() as Array<{ handle: string | null }>).map((row) => row.handle); const caseyOnly = handles.length === 1 && handles[0] === CASEY_HANDLE;
    const p = db.prepare("SELECT display_name,bio,profile_url,followers_count,following_count,captured_at FROM profile_snapshots WHERE lower(trim(handle))='caseymcdougal' ORDER BY captured_at DESC,id DESC LIMIT 1").get() as Row | undefined;
    const profile = p ? { handle: CASEY_HANDLE, displayName: requiredText(p.display_name, "display_name"), bio: requiredText(p.bio, "bio"), profileUrl: requiredText(p.profile_url, "profile_url"), followersCount: metric(p.followers_count, "followers_count"), followingCount: metric(p.following_count, "following_count"), capturedAt: requiredText(p.captured_at, "captured_at") } : null;
    const rows = db.prepare("SELECT p.x_post_id,p.url,p.text,p.posted_at,p.captured_at,p.views_count,p.likes_count,p.reposts_count,p.replies_count,p.bookmarks_count FROM post_snapshots p JOIN profile_snapshots s ON s.id=p.profile_snapshot_id WHERE lower(trim(s.handle))='caseymcdougal' ORDER BY p.captured_at ASC,p.id ASC").all() as Row[];
    const dedup = new Map<string, CreatorArchive["posts"][number]>(); for (const row of rows) { const post = { xPostId: requiredText(row.x_post_id, "x_post_id"), url: requiredText(row.url, "url"), text: requiredText(row.text, "text"), postedAt: nullableText(row.posted_at, "posted_at"), capturedAt: requiredText(row.captured_at, "captured_at"), viewsCount: metric(row.views_count, "views_count"), likesCount: metric(row.likes_count, "likes_count"), repostsCount: metric(row.reposts_count, "reposts_count"), repliesCount: metric(row.replies_count, "replies_count"), bookmarksCount: metric(row.bookmarks_count, "bookmarks_count") }; dedup.set(post.xPostId, post); }
    const posts = [...dedup.values()].sort((a, b) => a.xPostId.localeCompare(b.xPostId));
    const voice = db.prepare("SELECT v.profile_json FROM voice_profiles v JOIN profile_snapshots s ON s.id=v.profile_snapshot_id WHERE lower(trim(s.handle))='caseymcdougal' ORDER BY v.created_at DESC,v.id DESC LIMIT 1").get() as Row | undefined;
    const voiceProfile = voice ? voiceProfileSchema.parse(parseJson(voice.profile_json, "voice profile")) : null;
    const linked = db.prepare("SELECT m.memory_json FROM strategy_memories m JOIN strategy_memory_proposals p ON p.id=m.source_proposal_id JOIN profile_snapshots s ON s.id=p.profile_snapshot_id WHERE lower(trim(s.handle))='caseymcdougal' ORDER BY m.created_at DESC,m.id DESC LIMIT 1").get() as Row | undefined;
    const fallback = !linked && caseyOnly ? db.prepare("SELECT memory_json FROM strategy_memories ORDER BY created_at DESC,id DESC LIMIT 1").get() as Row | undefined : undefined;
    const strategyMemory = linked || fallback ? strategyMemorySchema.parse(parseJson((linked ?? fallback)!.memory_json, "strategy memory")) : null;
    const omittedFields: string[] = []; let voiceOverrides = ""; let creativeDirections: string[] = [];
    if (caseyOnly) { const override = db.prepare("SELECT text FROM voice_overrides WHERE id=1").get() as Row | undefined; voiceOverrides = override ? requiredText(override.text, "voice_overrides.text") : ""; creativeDirections = (db.prepare("SELECT text FROM creative_direction ORDER BY id ASC").all() as Row[]).map((row) => requiredText(row.text, "creative_direction.text")); } else omittedFields.push("voice overrides omitted: globally scoped legacy field is not attributable to Casey", "creative directions omitted: globally scoped legacy field is not attributable to Casey");
    if (!strategyMemory && !caseyOnly) omittedFields.push("strategy memory omitted: no Casey-linked strategy source exists");
    const timestamp = now().toISOString(); const normalized = creatorArchiveSchema.parse({ schemaVersion: 1, id: FIXED_ID, creatorId: "casey-mcdougal", source: "legacy-sqlite", consentBasis: "casey-requested-import", consentRecordedAt: timestamp, sourceFingerprint: "0".repeat(64), importedAt: timestamp, profile, posts, voiceProfile, voiceOverrides, strategyMemory, creativeDirections, importReport: { importedPosts: posts.length, omittedFields } });
    const sourceFingerprint = createHash("sha256").update(JSON.stringify({ profile: normalized.profile, posts: normalized.posts, voiceProfile: normalized.voiceProfile, voiceOverrides: normalized.voiceOverrides, strategyMemory: normalized.strategyMemory, creativeDirections: normalized.creativeDirections, omittedFields: normalized.importReport.omittedFields })).digest("hex");
    return creatorArchiveSchema.parse({ ...normalized, id: randomUUID(), sourceFingerprint });
  } finally { if (transaction) { try { db.exec("ROLLBACK"); } catch {} } db.close(); }
}

export function readLegacyCreatorArchive(options: ReadLegacyArchiveOptions): CreatorArchive { const snapshot = capturePrivateSnapshot(options.sqlitePath); try { return readSnapshot(snapshot.path, options.now ?? (() => new Date())); } finally { snapshot.cleanup(); } }
