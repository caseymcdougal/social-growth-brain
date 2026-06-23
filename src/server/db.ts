import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AppDatabase = Database.Database;

export function openDatabase(path: string): AppDatabase {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db: AppDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handle TEXT NOT NULL,
      display_name TEXT NOT NULL,
      bio TEXT NOT NULL,
      profile_url TEXT NOT NULL,
      followers_count INTEGER,
      following_count INTEGER,
      captured_at TEXT NOT NULL,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_snapshot_id INTEGER NOT NULL REFERENCES profile_snapshots(id) ON DELETE CASCADE,
      x_post_id TEXT NOT NULL,
      url TEXT NOT NULL,
      text TEXT NOT NULL,
      posted_at TEXT,
      views_count INTEGER,
      likes_count INTEGER,
      reposts_count INTEGER,
      replies_count INTEGER,
      bookmarks_count INTEGER,
      captured_at TEXT NOT NULL,
      source TEXT NOT NULL,
      UNIQUE(profile_snapshot_id, x_post_id)
    );

    CREATE TABLE IF NOT EXISTS analysis_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_snapshot_id INTEGER NOT NULL REFERENCES profile_snapshots(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      input_post_count INTEGER NOT NULL,
      prompt_version TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      error_stage TEXT,
      error_message TEXT,
      job_dir TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS strategy_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      analysis_run_id INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
      executive_summary TEXT NOT NULL,
      account_positioning_read TEXT NOT NULL,
      top_patterns_json TEXT NOT NULL,
      what_is_working_json TEXT NOT NULL,
      what_is_holding_back_json TEXT NOT NULL,
      content_pillars_json TEXT NOT NULL,
      next_post_recommendations_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      analysis_run_id INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
      post_snapshot_id INTEGER,
      x_post_id TEXT NOT NULL,
      performance_read TEXT NOT NULL,
      likely_reason TEXT NOT NULL,
      hook_diagnosis TEXT NOT NULL,
      clarity_diagnosis TEXT NOT NULL,
      audience_fit TEXT NOT NULL,
      recommended_change TEXT NOT NULL,
      rewrite TEXT NOT NULL,
      variant_hooks_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_snapshot_id INTEGER NOT NULL REFERENCES profile_snapshots(id) ON DELETE CASCADE,
      analysis_run_id INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      error_stage TEXT,
      error_message TEXT,
      job_dir TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generated_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generation_run_id INTEGER NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      angle TEXT NOT NULL,
      why_this TEXT NOT NULL,
      hook TEXT NOT NULL,
      draft TEXT NOT NULL,
      source_signal TEXT NOT NULL
    );
  `);
}
