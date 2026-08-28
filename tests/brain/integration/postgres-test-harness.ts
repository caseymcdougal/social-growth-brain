import type { Pool } from "pg";

export const TEST_DATABASE_URL =
  process.env.SOCIAL_BRAIN_TEST_DATABASE_URL ??
  "postgresql://social_brain:social_brain@127.0.0.1:54329/social_brain_test";

export function assertTestDatabaseUrl(databaseUrl: string): void {
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error(`Refusing destructive test cleanup for database: ${databaseName}`);
  }
}

export async function truncateBrainTables(pool: Pool): Promise<void> {
  assertTestDatabaseUrl(TEST_DATABASE_URL);
  await pool.query(`
    TRUNCATE TABLE
      brain_compliance_checks,
      brain_outcome_snapshots,
      brain_decision_events,
      brain_draft_variants,
      brain_signal_evidence,
      brain_opportunity_revisions,
      brain_opportunities,
      brain_creator_archives
    RESTART IDENTITY CASCADE
  `);
}
