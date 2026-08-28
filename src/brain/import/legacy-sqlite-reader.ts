import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { creatorArchiveSchema, type CreatorArchive } from "../domain";
import { strategyMemorySchema } from "../../shared/strategy-intelligence-schema";
import { voiceProfileSchema } from "../../shared/voice-profile";

const CASEY_HANDLE = "caseymcdougal";
const REQUIRED_TABLES = ["profile_snapshots", "post_snapshots", "voice_profiles", "voice_overrides", "strategy_memories", "strategy_memory_proposals", "creative_direction"];

export interface ReadLegacyArchiveOptions { sqlitePath: string; now?: () => Date; }

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value : "";
const nullableNumber = (value: unknown) => value === null || typeof value === "number" ? value : null;

function parseJson(value: unknown, label: string): unknown {
  try { return JSON.parse(text(value)); } catch { throw new Error(`Invalid archived ${label} JSON`); }
}

function profileFrom(row: Row) {
  return {
    handle: "caseymcdougal" as const, displayName: text(row.display_name), bio: text(row.bio), profileUrl: text(row.profile_url),
    followersCount: nullableNumber(row.followers_count), followingCount: nullableNumber(row.following_count), capturedAt: text(row.captured_at)
  };
}
function postFrom(row: Row) {
  return { xPostId: text(row.x_post_id), url: text(row.url), text: text(row.text), postedAt: row.posted_at === null ? null : text(row.posted_at), capturedAt: text(row.captured_at), viewsCount: nullableNumber(row.views_count), likesCount: nullableNumber(row.likes_count), repostsCount: nullableNumber(row.reposts_count), repliesCount: nullableNumber(row.replies_count), bookmarksCount: nullableNumber(row.bookmarks_count) };
}

export function readLegacyCreatorArchive(options: ReadLegacyArchiveOptions): CreatorArchive {
  const db = new Database(options.sqlitePath, { readonly: true, fileMustExist: true });
  try {
    db.pragma("query_only = ON");
    const tableNames = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name));
    for (const table of REQUIRED_TABLES) if (!tableNames.has(table)) throw new Error(`Missing required legacy table: ${table}`);
    const handles = (db.prepare("SELECT DISTINCT lower(trim(handle)) AS handle FROM profile_snapshots").all() as Array<{ handle: string }>).map((row) => row.handle).filter(Boolean);
    const caseyOnly = handles.length === 1 && handles[0] === CASEY_HANDLE;
    const profileRow = db.prepare("SELECT * FROM profile_snapshots WHERE lower(trim(handle)) = 'caseymcdougal' ORDER BY captured_at DESC, id DESC LIMIT 1").get() as Row | undefined;
    const profile = profileRow ? profileFrom(profileRow) : null;
    const postRows = db.prepare("SELECT p.* FROM post_snapshots p JOIN profile_snapshots s ON s.id = p.profile_snapshot_id WHERE lower(trim(s.handle)) = 'caseymcdougal' ORDER BY p.captured_at ASC, p.id ASC").all() as Row[];
    const postsById = new Map<string, ReturnType<typeof postFrom>>();
    for (const row of postRows) postsById.set(text(row.x_post_id), postFrom(row));
    const posts = [...postsById.values()];
    const voiceRow = db.prepare("SELECT v.profile_json FROM voice_profiles v JOIN profile_snapshots s ON s.id = v.profile_snapshot_id WHERE lower(trim(s.handle)) = 'caseymcdougal' ORDER BY v.created_at DESC, v.id DESC LIMIT 1").get() as Row | undefined;
    const voiceProfile = voiceRow ? voiceProfileSchema.parse(parseJson(voiceRow.profile_json, "voice profile")) : null;
    const linkedStrategy = db.prepare("SELECT m.memory_json FROM strategy_memories m JOIN strategy_memory_proposals p ON p.id = m.source_proposal_id JOIN profile_snapshots s ON s.id = p.profile_snapshot_id WHERE lower(trim(s.handle)) = 'caseymcdougal' ORDER BY m.created_at DESC, m.id DESC LIMIT 1").get() as Row | undefined;
    const fallbackStrategy = !linkedStrategy && caseyOnly ? db.prepare("SELECT memory_json FROM strategy_memories ORDER BY created_at DESC, id DESC LIMIT 1").get() as Row | undefined : undefined;
    const strategyRow = linkedStrategy ?? fallbackStrategy;
    const strategyMemory = strategyRow ? strategyMemorySchema.parse(parseJson(strategyRow.memory_json, "strategy memory")) : null;
    const omissions: string[] = [];
    let voiceOverrides = "";
    let creativeDirections: string[] = [];
    if (caseyOnly) {
      voiceOverrides = text((db.prepare("SELECT text FROM voice_overrides WHERE id = 1").get() as Row | undefined)?.text);
      creativeDirections = (db.prepare("SELECT text FROM creative_direction ORDER BY id ASC").all() as Row[]).map((row) => text(row.text)).filter(Boolean);
    } else {
      omissions.push("voice overrides omitted: globally scoped legacy field is not attributable to Casey", "creative directions omitted: globally scoped legacy field is not attributable to Casey");
    }
    if (!strategyMemory && !caseyOnly) omissions.push("strategy memory omitted: no Casey-linked strategy source exists");
    const canonical = { profile, posts, voiceProfile, strategyMemory, voiceOverrides, creativeDirections, omittedFields: omissions };
    const now = (options.now ?? (() => new Date()))().toISOString();
    return creatorArchiveSchema.parse({ schemaVersion: 1, id: randomUUID(), creatorId: "casey-mcdougal", source: "legacy-sqlite", consentBasis: "casey-requested-import", consentRecordedAt: now, sourceFingerprint: createHash("sha256").update(JSON.stringify(canonical)).digest("hex"), importedAt: now, ...canonical, importReport: { importedPosts: posts.length, omittedFields: omissions } });
  } finally { db.close(); }
}
