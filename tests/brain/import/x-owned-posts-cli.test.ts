import { describe, expect, it, vi } from "vitest";
import type { CreatorArchive } from "../../../src/brain/domain/creator-archive";
import { DEFAULT_OWNED_X_ARCHIVE_PATH } from "../../../src/brain/import/local-creator-archive";
import { loadOwnedXPostsEnvFile, runOwnedXPostsImportCli } from "../../../src/brain/import/x-owned-posts-cli";

const ARCHIVE: CreatorArchive = {
  schemaVersion: 1,
  id: "00000000-0000-4000-8000-000000000001",
  creatorId: "casey-mcdougal",
  source: "x-api-owned-posts",
  consentBasis: "casey-approved-x-owned-post-import",
  consentRecordedAt: "2026-09-03T12:00:00.000Z",
  sourceFingerprint: "a".repeat(64),
  importedAt: "2026-09-03T12:00:00.000Z",
  profile: null,
  posts: [],
  voiceProfile: null,
  voiceOverrides: "",
  strategyMemory: null,
  creativeDirections: [],
  importReport: { importedPosts: 0, omittedFields: [] }
};

function writer(lines: string[]) {
  return { write: (text: string) => { lines.push(text); return true; } };
}

describe("loadOwnedXPostsEnvFile", () => {
  it("loads only the selected client ID from .env", () => {
    const env: Record<string, string | undefined> = {};
    const readFile = vi.fn(() => "SOCIAL_BRAIN_X_OAUTH_CLIENT_ID=from-dotenv\nUNRELATED_DOTENV_VALUE=do-not-import\n");

    loadOwnedXPostsEnvFile({ env, envPath: "/repo/.env", readFile });
    expect(readFile).toHaveBeenCalledWith("/repo/.env");
    expect(env.SOCIAL_BRAIN_X_OAUTH_CLIENT_ID).toBe("from-dotenv");
    expect(env.UNRELATED_DOTENV_VALUE).toBeUndefined();
  });

  it("keeps an already-exported client ID without reading .env", () => {
    const exportedEnv: Record<string, string | undefined> = { SOCIAL_BRAIN_X_OAUTH_CLIENT_ID: "already-exported" };
    const readFile = vi.fn(() => "SOCIAL_BRAIN_X_OAUTH_CLIENT_ID=from-dotenv");

    loadOwnedXPostsEnvFile({ env: exportedEnv, readFile });
    expect(exportedEnv.SOCIAL_BRAIN_X_OAUTH_CLIENT_ID).toBe("already-exported");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("treats a missing .env file as harmless", () => {
    const env: Record<string, string | undefined> = {};
    const readFile = vi.fn(() => {
      const error = new Error("missing .env") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    });

    expect(() => loadOwnedXPostsEnvFile({ env, readFile })).not.toThrow();
    expect(env.SOCIAL_BRAIN_X_OAUTH_CLIENT_ID).toBeUndefined();
  });

  it("rejects a malformed selected entry without exposing its value", () => {
    const env: Record<string, string | undefined> = {};
    const malformedValue = "unterminated-client-id";
    const readFile = () => `SOCIAL_BRAIN_X_OAUTH_CLIENT_ID=\"${malformedValue}`;

    let message = "";
    try {
      loadOwnedXPostsEnvFile({ env, readFile });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("Invalid OAuth client ID entry in repository .env");
    expect(message).not.toContain(malformedValue);
    expect(env.SOCIAL_BRAIN_X_OAUTH_CLIENT_ID).toBeUndefined();
  });
});

describe("runOwnedXPostsImportCli", () => {
  it("uses the fixed read-only flow once and puts only archive identifiers on stdout", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const calls: string[] = [];
    const authorize = vi.fn(() => {
      calls.push("authorize");
      return {
        authorizationUrl: new URL("https://x.com/i/oauth2/authorize?state=state-value"),
        state: "state-value",
        codeVerifier: "verifier-value"
      };
    });
    const waitForCode = vi.fn(async (input: { expectedState: string; redirectUri?: string }) => {
      calls.push(`wait:${input.expectedState}:${input.redirectUri}`);
      return "authorization-code";
    });
    const exchangeCode = vi.fn(async (input: { clientId: string; redirectUri: string; code: string; codeVerifier: string }) => {
      calls.push(`exchange:${input.clientId}:${input.redirectUri}:${input.code}:${input.codeVerifier}`);
      return "access-token";
    });
    const readArchive = vi.fn(async (input: { accessToken: string }) => {
      calls.push(`read:${input.accessToken}`);
      return ARCHIVE;
    });
    const writeArchive = vi.fn((path: string, archive: CreatorArchive) => {
      calls.push(`write:${path}:${archive.id}`);
      return archive;
    });

    await runOwnedXPostsImportCli({
      args: [],
      env: { SOCIAL_BRAIN_X_OAUTH_CLIENT_ID: "public-client-id" },
      stdout: writer(stdout),
      stderr: writer(stderr),
      authorize,
      waitForCode,
      exchangeCode,
      readArchive,
      writeArchive
    });

    expect(authorize).toHaveBeenCalledOnce();
    expect(waitForCode).toHaveBeenCalledOnce();
    expect(exchangeCode).toHaveBeenCalledOnce();
    expect(readArchive).toHaveBeenCalledOnce();
    expect(writeArchive).toHaveBeenCalledOnce();
    expect(calls).toEqual([
      "authorize",
      "wait:state-value:http://127.0.0.1:8787/callback",
      "exchange:public-client-id:http://127.0.0.1:8787/callback:authorization-code:verifier-value",
      "read:access-token",
      `write:${DEFAULT_OWNED_X_ARCHIVE_PATH}:${ARCHIVE.id}`
    ]);
    expect(stderr.join("")).toMatch(/\$0\.05/);
    expect(stderr.join("").indexOf("$0.05")).toBeLessThan(stderr.join("").indexOf("https://x.com/i/oauth2/authorize"));
    expect(stderr.join("")).toContain("https://x.com/i/oauth2/authorize?state=state-value");
    expect(stdout.join("")).toBe(`${ARCHIVE.id}\n${ARCHIVE.sourceFingerprint}\n0\n`);
    expect(stdout.join("")).not.toContain("authorization-code");
    expect(stdout.join("")).not.toContain("access-token");
    expect(stdout.join("")).not.toContain("https://");
  });

  it("rejects arguments and a missing public client ID before opening authorization", async () => {
    const authorize = vi.fn();
    await expect(runOwnedXPostsImportCli({
      args: ["--anything"],
      env: { SOCIAL_BRAIN_X_OAUTH_CLIENT_ID: "public-client-id" },
      authorize
    })).rejects.toThrow(/Usage/);
    await expect(runOwnedXPostsImportCli({
      args: [],
      env: { SOCIAL_BRAIN_X_OAUTH_CLIENT_ID: "  " },
      authorize
    })).rejects.toThrow(/SOCIAL_BRAIN_X_OAUTH_CLIENT_ID/);
    expect(authorize).not.toHaveBeenCalled();
  });

  it("does not write a partial archive when any in-memory OAuth step fails", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const writeArchive = vi.fn();
    await expect(runOwnedXPostsImportCli({
      args: [],
      env: { SOCIAL_BRAIN_X_OAUTH_CLIENT_ID: "public-client-id" },
      stdout: writer(stdout),
      stderr: writer(stderr),
      authorize: () => ({
        authorizationUrl: new URL("https://x.com/i/oauth2/authorize?state=state-value"),
        state: "state-value",
        codeVerifier: "verifier-value"
      }),
      waitForCode: async () => "authorization-code",
      exchangeCode: async () => { throw new Error("exchange failed without serializing credentials"); },
      writeArchive
    })).rejects.toThrow("exchange failed");
    expect(writeArchive).not.toHaveBeenCalled();
    expect(stdout).toEqual([]);
    expect(stderr.join("")).not.toContain("authorization-code");
    expect(stderr.join("")).not.toContain("access-token");
  });
});
