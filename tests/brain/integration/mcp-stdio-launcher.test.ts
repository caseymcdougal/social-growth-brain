import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { TEST_DATABASE_URL } from "./postgres-test-harness";

function launch(command: string, arguments_: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: process.cwd(),
      env: { ...process.env, SOCIAL_BRAIN_MODE: "synthetic", SOCIAL_BRAIN_DATABASE_URL: TEST_DATABASE_URL },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end();
  });
}

describe("documented MCP launcher", () => {
  it("does not pollute protocol stdout with an npm banner", async () => {
    const result = await launch("npm", ["--silent", "run", "brain:mcp"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});
