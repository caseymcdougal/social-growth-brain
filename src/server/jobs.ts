import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function createJobDir(dataDir: string, prefix: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(dataDir, "jobs", `${prefix}-${stamp}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
