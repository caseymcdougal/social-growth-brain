import pg, { type Pool as PoolType } from "pg";

const { Pool } = pg;

export function createPostgresPool(databaseUrl: string): PoolType {
  return new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
}
