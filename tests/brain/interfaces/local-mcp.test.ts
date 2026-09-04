import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import packageJson from "../../../package.json";
import type { CreatorArchive } from "../../../src/brain/domain";
import { writeLocalCreatorArchive } from "../../../src/brain/import/local-creator-archive";
import { createLocalMcpServer } from "../../../src/brain/interfaces/mcp/local-server";

const temporaryDirectories: string[] = [];

function archive(postCount = 1): CreatorArchive {
  const posts = Array.from({ length: postCount }, (_, index) => {
    const xPostId = `123456789012345${String(index).padStart(3, "0")}`;
    return {
      xPostId,
      url: `https://x.com/caseymcdougal/status/${xPostId}`,
      text: "Local owned post",
      postedAt: "2026-09-02T12:00:00.000Z",
      capturedAt: "2026-09-03T12:00:00.000Z",
      viewsCount: 100,
      likesCount: 10,
      repostsCount: 2,
      repliesCount: 3,
      bookmarksCount: 4
    };
  });
  return {
    schemaVersion: 1,
    id: "10000000-0000-4000-8000-000000000001",
    creatorId: "casey-mcdougal",
    source: "x-api-owned-posts",
    consentBasis: "casey-approved-x-owned-post-import",
    consentRecordedAt: "2026-09-03T12:00:00.000Z",
    sourceFingerprint: "a".repeat(64),
    importedAt: "2026-09-03T12:01:00.000Z",
    profile: {
      handle: "caseymcdougal",
      displayName: "Casey McDougal",
      bio: "Builder",
      profileUrl: "https://x.com/caseymcdougal",
      followersCount: 100,
      followingCount: 200,
      capturedAt: "2026-09-03T12:00:00.000Z"
    },
    posts,
    voiceProfile: null,
    voiceOverrides: "",
    strategyMemory: null,
    creativeDirections: [],
    importReport: { importedPosts: postCount, omittedFields: [] }
  };
}

function archivePath(): string {
  const directory = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), "social-brain-local-mcp-"));
  temporaryDirectories.push(directory);
  return join(directory, "archive.json");
}

async function withClient(server: Awaited<ReturnType<typeof createLocalMcpServer>>, callback: (client: Client) => Promise<void>) {
  const client = new Client({ name: "social-brain-local-mcp-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    await callback(client);
  } finally {
    await client.close();
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("local archive MCP server", () => {
  it("registers the local-only stdio launcher", () => {
    expect(packageJson.scripts["brain:mcp:local"]).toBe("tsx src/brain/interfaces/mcp/local-stdio.ts");
  });

  it("serves an explicit local archive alongside the three synthetic demo opportunities", async () => {
    const path = archivePath();
    const expected = writeLocalCreatorArchive(path, archive());

    await withClient(await createLocalMcpServer({ archivePath: path }), async (client) => {
      expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
        "explain_prediction",
        "get_creator_archive",
        "get_proof_status",
        "get_system_health",
        "inspect_opportunity",
        "list_opportunities"
      ]);

      const result = (await client.callTool({ name: "get_creator_archive", arguments: {} })).structuredContent as {
        available: boolean;
        archive: CreatorArchive | null;
      };
      expect(result).toEqual({ available: true, archive: expected });

      const health = (await client.callTool({ name: "get_system_health", arguments: {} })).structuredContent as {
        creatorArchive: { available: boolean; source: string | null; importedAt: string | null };
        capabilities: Array<{ allowed: boolean }>;
      };
      expect(health.creatorArchive).toEqual({ available: true, source: "x-api-owned-posts", importedAt: expected.importedAt });
      expect(health.capabilities.every(({ allowed }) => !allowed)).toBe(true);

      const listed = (await client.callTool({ name: "list_opportunities", arguments: {} })).structuredContent as {
        opportunities: Array<{ id: string; actionType: string }>;
      };
      expect(listed.opportunities.map(({ id, actionType }) => ({ id, actionType }))).toEqual([
        { id: "20000000-0000-4000-8000-000000000001", actionType: "reply" },
        { id: "20000000-0000-4000-8000-000000000002", actionType: "quote" },
        { id: "20000000-0000-4000-8000-000000000003", actionType: "original" }
      ]);
    });
  });

  it("starts without an absent archive and reports it unavailable", async () => {
    await withClient(await createLocalMcpServer({ archivePath: archivePath() }), async (client) => {
      expect((await client.callTool({ name: "get_creator_archive", arguments: {} })).structuredContent).toEqual({ available: false, archive: null });
      expect((await client.callTool({ name: "get_system_health", arguments: {} })).structuredContent).toMatchObject({
        creatorArchive: { available: false, source: null, importedAt: null }
      });
    });
  });

  it("accepts exactly 25 owned X posts", async () => {
    const path = archivePath();
    const expected = writeLocalCreatorArchive(path, archive(25));

    await withClient(await createLocalMcpServer({ archivePath: path }), async (client) => {
      const result = (await client.callTool({ name: "get_creator_archive", arguments: {} })).structuredContent as {
        available: boolean;
        archive: CreatorArchive | null;
      };
      expect(result).toEqual({ available: true, archive: expected });
      expect(result.archive?.posts).toHaveLength(25);
    });
  });

  it("fails closed when the explicit local archive contains more than 25 owned X posts", async () => {
    const path = archivePath();
    fs.writeFileSync(path, JSON.stringify(archive(26)), { mode: 0o600 });
    await expect(createLocalMcpServer({ archivePath: path })).rejects.toThrow(/at most 25/);
  });

  it("fails closed when the explicit local archive is invalid", async () => {
    const path = archivePath();
    fs.writeFileSync(path, "not JSON");
    await expect(createLocalMcpServer({ archivePath: path })).rejects.toThrow();
  });
});
