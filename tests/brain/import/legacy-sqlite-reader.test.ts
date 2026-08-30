import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../../src/server/db";
import { createRepositories } from "../../../src/server/repositories";
import { readLegacyCreatorArchive } from "../../../src/brain/import/legacy-sqlite-reader";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const voice = { summary: "Direct", casing_and_punctuation: ["lowercase"], sentence_rhythm: ["short"], vocabulary: ["build"], hook_moves: ["claim"], banned_moves: ["hype"], style_excerpts: ["Build the useful thing."] };
const strategy = { positioning: "builder", audience_segments: ["builders"], strongest_lanes: ["product"], weak_lanes: ["news"], voice_rules: ["plain"], proof_points: ["shipped"], active_experiments: [{ hypothesis: "direct works", status: "active", evidence: "posts" }] };
function sourceSnapshot(sqlitePath: string) {
  const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  try {
    const tableNames = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
    return {
      schemaVersion: db.pragma("schema_version", { simple: true }),
      tableNames,
      rowCounts: Object.fromEntries(tableNames.map((table) => [table, Number((db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count)])),
      bytes: readFileSync(sqlitePath),
      files: readdirSync(join(sqlitePath, "..")).sort()
    };
  } finally { db.close(); }
}
function fixture(mixed = false) {
  const dir = mkdtempSync(join(tmpdir(), "legacy-reader-")); dirs.push(dir); const sqlitePath = join(dir, "legacy.sqlite"); const db = openDatabase(sqlitePath); const repos = createRepositories(db);
  const add = (handle: string, at: string, body: string, xPostId = "100") => repos.saveCapturedSnapshot({ profile: { handle, displayName: handle, bio: "bio", profileUrl: `https://x.com/${handle}`, followersCount: 1, followingCount: 2, capturedAt: at, source: "manual" }, posts: [{ xPostId, url: `https://x.com/${handle}/status/${xPostId}`, text: body, postedAt: null, capturedAt: at, source: "manual", viewsCount: 1, likesCount: 2, repostsCount: 3, repliesCount: 4, bookmarksCount: 5 }] });
  add("caseymcdougal", "2026-08-01T00:00:00.000Z", "old"); const caseyNew = add("CaseyMcDougal", "2026-08-02T00:00:00.000Z", "new"); if (mixed) add("someoneelse", "2026-08-03T00:00:00.000Z", "other", "200");
  db.prepare("INSERT INTO voice_profiles (profile_snapshot_id, profile_json, created_at, job_dir) VALUES (?, ?, ?, ?)").run(caseyNew, JSON.stringify(voice), "2026-08-04T00:00:00.000Z", "ignored");
  const analysisId = Number(db.prepare("INSERT INTO analysis_runs (profile_snapshot_id, status, input_post_count, prompt_version, schema_version, started_at, job_dir) VALUES (?, 'succeeded', 0, 'v1', 'v1', ?, 'ignored')").run(caseyNew, "2026-08-04T00:00:00.000Z").lastInsertRowid);
  const proposalId = Number(db.prepare("INSERT INTO strategy_memory_proposals (profile_snapshot_id, analysis_run_id, status, proposed_memory_json, updates_json, created_at, job_dir) VALUES (?, ?, 'applied', ?, '[]', ?, 'ignored')").run(caseyNew, analysisId, JSON.stringify(strategy), "2026-08-04T00:00:00.000Z").lastInsertRowid);
  db.prepare("INSERT INTO strategy_memories (source_proposal_id, memory_json, created_at) VALUES (?, ?, ?)").run(proposalId, JSON.stringify(strategy), "2026-08-05T00:00:00.000Z"); db.prepare("INSERT INTO voice_overrides (id, text, updated_at) VALUES (1, 'keep it sharp', ?)").run("2026-08-05T00:00:00.000Z"); db.prepare("INSERT INTO creative_direction (text, updated_at) VALUES ('write more examples', ?)").run("2026-08-05T00:00:00.000Z"); db.pragma("journal_mode = DELETE"); db.close(); return { sqlitePath };
}
describe("readLegacyCreatorArchive", () => {
  it("imports only Casey-owned latest/deduplicated content without mutating source", () => {
    const { sqlitePath } = fixture(); const before = readFileSync(sqlitePath); const archive = readLegacyCreatorArchive({ sqlitePath, now: () => new Date("2026-08-06T00:00:00.000Z") });
    expect(archive.profile?.displayName).toBe("CaseyMcDougal"); expect(archive.posts).toHaveLength(1); expect(archive.posts[0]?.text).toBe("new"); expect(archive.voiceProfile).toEqual(voice); expect(archive.strategyMemory).toEqual(strategy); expect(archive.voiceOverrides).toBe("keep it sharp"); expect(archive.creativeDirections).toEqual(["write more examples"]); expect(readFileSync(sqlitePath)).toEqual(before);
  });
  it("omits global fields from mixed-creator archives", () => {
    const { sqlitePath } = fixture(true); const archive = readLegacyCreatorArchive({ sqlitePath });
    expect(archive.posts).toHaveLength(1); expect(archive.voiceOverrides).toBe(""); expect(archive.creativeDirections).toEqual([]); expect(archive.importReport.omittedFields).toEqual(expect.arrayContaining([expect.stringContaining("voice overrides"), expect.stringContaining("creative directions")]));
  });
  it("rejects corrupt numeric values instead of silently converting them", () => {
    const { sqlitePath } = fixture(); const db = openDatabase(sqlitePath);
    db.prepare("UPDATE profile_snapshots SET followers_count = 'broken' WHERE lower(handle) = 'caseymcdougal'").run(); db.close();
    expect(() => readLegacyCreatorArchive({ sqlitePath })).toThrow("followers_count");
  });
  it("rejects corrupt post metrics instead of silently converting them", () => {
    const { sqlitePath } = fixture(); const db = openDatabase(sqlitePath);
    db.prepare("UPDATE post_snapshots SET likes_count = 'broken'").run(); db.close();
    expect(() => readLegacyCreatorArchive({ sqlitePath })).toThrow("likes_count");
  });
  it("rejects fractional, negative, and malformed creator text", () => {
    const { sqlitePath } = fixture(); const db = openDatabase(sqlitePath);
    db.prepare("UPDATE post_snapshots SET views_count = -1").run(); db.close(); expect(() => readLegacyCreatorArchive({ sqlitePath })).toThrow("views_count");
    const second = fixture().sqlitePath; const db2 = openDatabase(second); db2.prepare("UPDATE post_snapshots SET likes_count = 1.5").run(); db2.close(); expect(() => readLegacyCreatorArchive({ sqlitePath: second })).toThrow("likes_count");
  });
  it("fails closed for symlink and active WAL sources without changing source files", () => {
    const { sqlitePath } = fixture(); const link = `${sqlitePath}.link`; symlinkSync(sqlitePath, link); expect(() => readLegacyCreatorArchive({ sqlitePath: link })).toThrow("symlink");
    const db = openDatabase(sqlitePath); db.pragma("journal_mode = WAL"); db.prepare("INSERT INTO creative_direction (text, updated_at) VALUES ('wal', ?)").run("2026-08-07T00:00:00.000Z"); const before = readdirSync(join(sqlitePath, "..")).sort();
    expect(() => readLegacyCreatorArchive({ sqlitePath })).toThrow("active WAL sidecars"); expect(readdirSync(join(sqlitePath, "..")).sort()).toEqual(before); db.close();
  });
  it("hashes normalized creative directions and stable retained-post order", () => {
    const { sqlitePath } = fixture(); const db = openDatabase(sqlitePath); db.prepare("UPDATE creative_direction SET text = '  write more examples  '").run(); db.close();
    const first = readLegacyCreatorArchive({ sqlitePath, now: () => new Date("2026-08-08T00:00:00.000Z") }); const second = readLegacyCreatorArchive({ sqlitePath, now: () => new Date("2026-08-08T00:00:00.000Z") });
    expect(first.creativeDirections).toEqual(["write more examples"]); expect(first.sourceFingerprint).toBe(second.sourceFingerprint); expect(first.posts.map((post) => post.xPostId)).toEqual([...first.posts.map((post) => post.xPostId)].sort());
  });
  it("treats blank handles as unattributable mixed creators", () => {
    const { sqlitePath } = fixture(); const db = openDatabase(sqlitePath);
    db.prepare("INSERT INTO profile_snapshots (handle, display_name, bio, profile_url, captured_at, source) VALUES ('   ', 'unknown', '', 'https://x.com/unknown', '2026-08-06T00:00:00.000Z', 'manual')").run(); db.prepare("DELETE FROM strategy_memories").run(); db.prepare("INSERT INTO strategy_memories (memory_json, created_at) VALUES (?, ?)").run(JSON.stringify(strategy), "2026-08-06T00:00:00.000Z"); db.close();
    const archive = readLegacyCreatorArchive({ sqlitePath });
    expect(archive.voiceOverrides).toBe(""); expect(archive.creativeDirections).toEqual([]); expect(archive.strategyMemory).toBeNull(); expect(archive.importReport.omittedFields).toEqual(expect.arrayContaining([expect.stringContaining("voice overrides"), expect.stringContaining("creative directions"), expect.stringContaining("strategy memory omitted")]));
  });
  it("fails named missing tables without recreating a legacy schema", () => {
    const { sqlitePath } = fixture(); const db = openDatabase(sqlitePath); db.exec("DROP TABLE creative_direction"); db.close();
    expect(() => readLegacyCreatorArchive({ sqlitePath })).toThrow("Missing required legacy table: creative_direction");
    const check = new Database(sqlitePath, { readonly: true, fileMustExist: true }); expect(check.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'creative_direction'").get()).toBeUndefined(); check.close();
  });
  it("rejects invalid archived voice and strategy JSON", () => {
    const { sqlitePath } = fixture(); const db = openDatabase(sqlitePath); db.prepare("UPDATE voice_profiles SET profile_json = '{bad'").run(); db.close();
    expect(() => readLegacyCreatorArchive({ sqlitePath })).toThrow("Invalid archived voice profile JSON");
    const second = fixture().sqlitePath; const db2 = openDatabase(second); db2.prepare("UPDATE strategy_memories SET memory_json = '{bad'").run(); db2.close();
    expect(() => readLegacyCreatorArchive({ sqlitePath: second })).toThrow("Invalid archived strategy memory JSON");
  });
  it("does not depend on forbidden analysis tables or mutate source state", () => {
    const { sqlitePath } = fixture(); const db = openDatabase(sqlitePath);
    db.pragma("foreign_keys = OFF"); for (const table of ["analysis_runs", "strategy_reports", "post_analyses", "generation_runs", "generated_posts", "topic_exploration_runs"]) db.exec(`DROP TABLE ${table}`); db.pragma("journal_mode = DELETE"); db.close();
    const before = sourceSnapshot(sqlitePath);
    expect(readLegacyCreatorArchive({ sqlitePath }).profile?.handle).toBe("caseymcdougal");
    expect(sourceSnapshot(sqlitePath)).toEqual(before);
  });
});
