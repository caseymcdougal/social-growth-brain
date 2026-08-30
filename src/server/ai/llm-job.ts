import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// Primary engine: Claude Code CLI on the Max subscription (no API billing).
// Opus 5 first; the CLI auto-falls back to Sonnet if Opus is unavailable/overloaded.
// Final fallback: Codex CLI (gpt-5.5 xhigh from ~/.codex/config.toml), the original path.
const CLAUDE_MODEL = "opus";
const CLAUDE_FALLBACK_MODEL = "sonnet";
const CLAUDE_EFFORT = "high";
const CLAUDE_TIMEOUT_MS = 15 * 60_000;

export interface LlmJobPaths {
  jobDir: string;
  promptPath: string;
  schemaPath: string;
  outputPath: string;
}

export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(text.slice(start, end + 1));
}

function buildCodexArgs(paths: LlmJobPaths) {
  return [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--cd",
    paths.jobDir,
    "--output-schema",
    paths.schemaPath,
    "--output-last-message",
    paths.outputPath,
    "-"
  ];
}

function runCommand(
  command: string,
  args: string[],
  stdin: string,
  options: { timeoutMs?: number } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, options.timeoutMs)
      : null;

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command} timed out after ${options.timeoutMs}ms`));
        return;
      }
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} failed with code ${code}: ${stderr.slice(0, 1000)}`));
    });
    child.stdin.end(stdin);
  });
}

export async function runLlmJob<T>(paths: LlmJobPaths, parse: (raw: unknown) => T): Promise<T> {
  const prompt = readFileSync(paths.promptPath, "utf8");

  try {
    const schema = readFileSync(paths.schemaPath, "utf8");
    const stdout = await runCommand(
      "claude",
      ["-p", "--model", CLAUDE_MODEL, "--fallback-model", CLAUDE_FALLBACK_MODEL, "--effort", CLAUDE_EFFORT],
      `${prompt}\n\nYour entire reply must be raw JSON (no markdown fences, no prose) that validates against this JSON Schema:\n${schema}`,
      { timeoutMs: CLAUDE_TIMEOUT_MS }
    );
    const parsed = parse(extractJson(stdout));
    writeFileSync(paths.outputPath, JSON.stringify(parsed, null, 2));
    console.log(`[llm] claude ${CLAUDE_MODEL}/${CLAUDE_EFFORT} ok: ${paths.jobDir}`);
    return parsed;
  } catch (error) {
    console.warn(
      `[llm] claude failed, falling back to codex: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  await runCommand("codex", buildCodexArgs(paths), prompt);
  return parse(JSON.parse(readFileSync(paths.outputPath, "utf8")));
}
