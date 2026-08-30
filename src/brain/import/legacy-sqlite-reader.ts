import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { creatorArchiveSchema, isoTimestampSchema, type CreatorArchive } from "../domain";
import { strategyMemorySchema } from "../../shared/strategy-intelligence-schema";
import { voiceProfileSchema } from "../../shared/voice-profile";

const CASEY_HANDLE = "caseymcdougal";
const REQUIRED_TABLES = ["profile_snapshots", "post_snapshots", "voice_profiles", "voice_overrides", "strategy_memories", "strategy_memory_proposals", "creative_direction"];
const FIXED_ID = "00000000-0000-4000-8000-000000000001";
type Row = Record<string, unknown>;
export interface ReadLegacyArchiveOptions { sqlitePath: string; now?: () => Date; }
function requiredText(value: unknown, field: string): string { if (typeof value !== "string") throw new Error(`Invalid legacy text field: ${field}`); return value; }
function metric(value: unknown, field: string): number | null { if (value === null) return null; if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value; throw new Error(`Invalid legacy numeric field: ${field}`); }
function positiveId(value: unknown, field: string): number { if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value; throw new Error(`Invalid legacy ID field: ${field}`); }
function validTimestamp(value: unknown, field: string): string { try { return isoTimestampSchema.parse(requiredText(value, field)); } catch { throw new Error(`Invalid legacy timestamp field: ${field}`); } }
function nullableTimestamp(value: unknown, field: string): string | null { return value === null ? null : validTimestamp(value, field); }
function normalizedHandle(value: unknown): string | null { return value === null ? null : requiredText(value, "handle").trim().toLowerCase(); }
function parseJson(value: unknown, label: string): unknown { try { return JSON.parse(requiredText(value, `${label}_json`)); } catch { throw new Error(`Invalid archived ${label} JSON`); } }

/** Never opens the user-owned database in place; any live SQLite sidecar is unsafe. */
function capturePrivateSnapshot(sqlitePath: string): { path: string; cleanup(): void } {
  const source = resolve(sqlitePath); const sourceStat = fs.lstatSync(source);
  if (sourceStat.isSymbolicLink()) throw new Error("Legacy SQLite source must not be a symlink");
  if (!sourceStat.isFile()) throw new Error("Legacy SQLite source must be a regular file");
  if (sourceStat.nlink !== 1) throw new Error("Legacy SQLite source has multiple hard links; import the sole quiescent pathname instead");
  const assertNoSidecars = () => { for (const suffix of ["-journal", "-wal", "-shm"]) { try { fs.lstatSync(`${source}${suffix}`); throw new Error("Legacy SQLite source has active SQLite sidecars; close and checkpoint it before import"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } } };
  assertNoSidecars();
  const directory = fs.mkdtempSync(join(tmpdir(), "social-brain-legacy-")); const snapshotPath = join(directory, basename(source)); let fd: number | undefined;
  try {
    fd = fs.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); const before = fs.fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.dev !== sourceStat.dev || before.ino !== sourceStat.ino) throw new Error("Legacy SQLite source changed before capture; retry after it is quiescent");
    fs.writeFileSync(snapshotPath, fs.readFileSync(fd), { mode: 0o600 }); const after = fs.fstatSync(fd); const finalPath = fs.lstatSync(source); assertNoSidecars();
    if (before.nlink !== 1 || after.nlink !== 1 || finalPath.nlink !== 1 || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || finalPath.dev !== before.dev || finalPath.ino !== before.ino) throw new Error("Legacy SQLite source changed while capturing; retry after it is quiescent");
    return { path: snapshotPath, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
  } catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function validateRowsBeforeSelection(db: Database.Database): { caseyOnly: boolean } {
  const profiles = db.prepare("SELECT id, handle, captured_at FROM profile_snapshots").all() as Row[];
  const handles = profiles.map((row) => { positiveId(row.id, "profile_snapshots.id"); validTimestamp(row.captured_at, "profile_snapshots.captured_at"); return normalizedHandle(row.handle); });
  for (const row of db.prepare("SELECT id, profile_snapshot_id, x_post_id, captured_at, posted_at FROM post_snapshots").all() as Row[]) { positiveId(row.id, "post_snapshots.id"); positiveId(row.profile_snapshot_id, "post_snapshots.profile_snapshot_id"); requiredText(row.x_post_id, "post_snapshots.x_post_id"); validTimestamp(row.captured_at, "post_snapshots.captured_at"); nullableTimestamp(row.posted_at, "post_snapshots.posted_at"); }
  for (const row of db.prepare("SELECT id, profile_snapshot_id, created_at FROM voice_profiles").all() as Row[]) { positiveId(row.id, "voice_profiles.id"); positiveId(row.profile_snapshot_id, "voice_profiles.profile_snapshot_id"); validTimestamp(row.created_at, "voice_profiles.created_at"); }
  for (const row of db.prepare("SELECT id, source_proposal_id, created_at FROM strategy_memories").all() as Row[]) { positiveId(row.id, "strategy_memories.id"); if (row.source_proposal_id !== null) positiveId(row.source_proposal_id, "strategy_memories.source_proposal_id"); validTimestamp(row.created_at, "strategy_memories.created_at"); }
  for (const row of db.prepare("SELECT id, profile_snapshot_id, created_at FROM strategy_memory_proposals").all() as Row[]) { positiveId(row.id, "strategy_memory_proposals.id"); positiveId(row.profile_snapshot_id, "strategy_memory_proposals.profile_snapshot_id"); validTimestamp(row.created_at, "strategy_memory_proposals.created_at"); }
  return { caseyOnly: new Set(handles).size === 1 && handles[0] === CASEY_HANDLE };
}

function readSnapshot(snapshotPath: string, now: () => Date): CreatorArchive {
  const db = new Database(snapshotPath, { readonly: true, fileMustExist: true }); let transaction = false;
  try {
    db.pragma("query_only = ON"); db.exec("BEGIN"); transaction = true;
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name)); for (const table of REQUIRED_TABLES) if (!tables.has(table)) throw new Error(`Missing required legacy table: ${table}`);
    const { caseyOnly } = validateRowsBeforeSelection(db);
    const selectedProfile = db.prepare("SELECT display_name, bio, profile_url, followers_count, following_count, captured_at FROM profile_snapshots WHERE lower(trim(handle)) = ? ORDER BY captured_at DESC, id DESC LIMIT 1").get(CASEY_HANDLE) as Row | undefined;
    const profile = selectedProfile ? { handle: CASEY_HANDLE, displayName: requiredText(selectedProfile.display_name, "display_name"), bio: requiredText(selectedProfile.bio, "bio"), profileUrl: requiredText(selectedProfile.profile_url, "profile_url"), followersCount: metric(selectedProfile.followers_count, "followers_count"), followingCount: metric(selectedProfile.following_count, "following_count"), capturedAt: validTimestamp(selectedProfile.captured_at, "captured_at") } : null;
    const rows = db.prepare("SELECT p.x_post_id, p.url, p.text, p.posted_at, p.captured_at, p.views_count, p.likes_count, p.reposts_count, p.replies_count, p.bookmarks_count FROM post_snapshots p JOIN profile_snapshots s ON s.id = p.profile_snapshot_id WHERE lower(trim(s.handle)) = ? ORDER BY p.captured_at ASC, p.id ASC").all(CASEY_HANDLE) as Row[];
    const dedup = new Map<string, CreatorArchive["posts"][number]>(); for (const row of rows) { const post = { xPostId: requiredText(row.x_post_id, "x_post_id"), url: requiredText(row.url, "url"), text: requiredText(row.text, "text"), postedAt: nullableTimestamp(row.posted_at, "posted_at"), capturedAt: validTimestamp(row.captured_at, "captured_at"), viewsCount: metric(row.views_count, "views_count"), likesCount: metric(row.likes_count, "likes_count"), repostsCount: metric(row.reposts_count, "reposts_count"), repliesCount: metric(row.replies_count, "replies_count"), bookmarksCount: metric(row.bookmarks_count, "bookmarks_count") }; dedup.set(post.xPostId, post); }
    const posts = [...dedup.values()].sort((left, right) => left.xPostId.localeCompare(right.xPostId));
    const voice = db.prepare("SELECT v.profile_json FROM voice_profiles v JOIN profile_snapshots s ON s.id = v.profile_snapshot_id WHERE lower(trim(s.handle)) = ? ORDER BY v.created_at DESC, v.id DESC LIMIT 1").get(CASEY_HANDLE) as Row | undefined; const voiceProfile = voice ? voiceProfileSchema.parse(parseJson(voice.profile_json, "voice profile")) : null;
    const linked = db.prepare("SELECT m.memory_json FROM strategy_memories m JOIN strategy_memory_proposals p ON p.id = m.source_proposal_id JOIN profile_snapshots s ON s.id = p.profile_snapshot_id WHERE lower(trim(s.handle)) = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 1").get(CASEY_HANDLE) as Row | undefined;
    const fallback = !linked && caseyOnly ? db.prepare("SELECT memory_json FROM strategy_memories ORDER BY created_at DESC, id DESC LIMIT 1").get() as Row | undefined : undefined; const strategyMemory = linked || fallback ? strategyMemorySchema.parse(parseJson((linked ?? fallback)!.memory_json, "strategy memory")) : null;
    const omittedFields: string[] = []; let voiceOverrides = ""; let creativeDirections: string[] = [];
    if (caseyOnly) { const override = db.prepare("SELECT text FROM voice_overrides WHERE id = 1").get() as Row | undefined; voiceOverrides = override ? requiredText(override.text, "voice_overrides.text") : ""; creativeDirections = (db.prepare("SELECT text FROM creative_direction ORDER BY id ASC").all() as Row[]).map((row) => requiredText(row.text, "creative_direction.text")); }
    else omittedFields.push("voice overrides omitted: globally scoped legacy field is not attributable to Casey", "creative directions omitted: globally scoped legacy field is not attributable to Casey");
    if (!strategyMemory && !caseyOnly) omittedFields.push("strategy memory omitted: no Casey-linked strategy source exists");
    const importedAt = now().toISOString(); const normalized = creatorArchiveSchema.parse({ schemaVersion: 1, id: FIXED_ID, creatorId: "casey-mcdougal", source: "legacy-sqlite", consentBasis: "casey-requested-import", consentRecordedAt: importedAt, sourceFingerprint: "0".repeat(64), importedAt, profile, posts, voiceProfile, voiceOverrides, strategyMemory, creativeDirections, importReport: { importedPosts: posts.length, omittedFields } });
    const sourceFingerprint = createHash("sha256").update(JSON.stringify({ profile: normalized.profile, posts: normalized.posts, voiceProfile: normalized.voiceProfile, voiceOverrides: normalized.voiceOverrides, strategyMemory: normalized.strategyMemory, creativeDirections: normalized.creativeDirections, omittedFields: normalized.importReport.omittedFields })).digest("hex"); return creatorArchiveSchema.parse({ ...normalized, id: randomUUID(), sourceFingerprint });
  } finally { if (transaction) { try { db.exec("ROLLBACK"); } catch {} } db.close(); }
}

export function readLegacyCreatorArchive(options: ReadLegacyArchiveOptions): CreatorArchive { const snapshot = capturePrivateSnapshot(options.sqlitePath); try { return readSnapshot(snapshot.path, options.now ?? (() => new Date())); } finally { snapshot.cleanup(); } }
