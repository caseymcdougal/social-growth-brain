import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { normalizeCapturedSnapshot } from "../../shared/normalize";
import type { CapturedAccountSnapshot, PostSnapshotInput } from "../../shared/types";
import { CaptureError, type CaptureRunner } from "./capture-runner";

const X_MCP_DEFAULT_URL = "https://api.x.com/mcp";
const USER_FIELDS = ["description", "public_metrics", "username", "name"] as const;
const TWEET_FIELDS = ["created_at", "public_metrics", "referenced_tweets", "text"] as const;

export interface XMcpToolClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

interface XMcpCaptureRunnerOptions {
  serverUrl?: string;
  bearerToken?: string | null;
  clientFactory?: () => XMcpToolClient;
  now?: () => string;
}

interface XUser {
  id?: unknown;
  username?: unknown;
  name?: unknown;
  description?: unknown;
  public_metrics?: {
    followers_count?: unknown;
    following_count?: unknown;
  };
}

interface XPost {
  id?: unknown;
  text?: unknown;
  created_at?: unknown;
  referenced_tweets?: { type?: unknown }[];
  public_metrics?: {
    impression_count?: unknown;
    like_count?: unknown;
    retweet_count?: unknown;
    reply_count?: unknown;
    bookmark_count?: unknown;
  };
}

function sanitizeHandle(handle: string) {
  return handle.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15) || "caseymcdougal";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstDataObject(payload: unknown): XUser | null {
  if (!payload || typeof payload !== "object") return null;
  if ("data" in payload && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    return payload.data as XUser;
  }
  return payload as XUser;
}

function dataArray(payload: unknown): XPost[] {
  if (!payload || typeof payload !== "object") return [];
  const data = "data" in payload ? payload.data : payload;
  return Array.isArray(data) ? (data as XPost[]) : [];
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toolPayloadOrThrow(result: unknown): unknown {
  const payload = extractToolPayload(result);
  if (result && typeof result === "object" && "isError" in result && result.isError) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? asString((payload as { detail?: unknown }).detail)
        : "";
    throw new Error(detail || `X MCP tool error: ${JSON.stringify(payload).slice(0, 200)}`);
  }
  return payload;
}

function extractToolPayload(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  if ("structuredContent" in result && result.structuredContent) return result.structuredContent;
  if ("content" in result && Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block && typeof block === "object" && "type" in block && block.type === "text" && "text" in block) {
        return parseJsonText(asString(block.text));
      }
    }
  }
  return result;
}

function isRepostOrReply(post: XPost) {
  return (post.referenced_tweets ?? []).some((reference) => reference.type === "retweeted" || reference.type === "replied_to");
}

class SdkXMcpToolClient implements XMcpToolClient {
  private readonly client = new Client({ name: "social-audit-dashboard", version: "0.1.0" });
  private readonly transport: StreamableHTTPClientTransport;

  constructor(serverUrl: string, bearerToken?: string | null) {
    const headers: Record<string, string> = {};
    if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
    this.transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      requestInit: Object.keys(headers).length ? { headers } : undefined
    });
  }

  async connect() {
    await this.client.connect(this.transport);
  }

  async close() {
    await this.transport.close();
  }

  async callTool(name: string, args: Record<string, unknown>) {
    return this.client.callTool({ name, arguments: args });
  }
}

export class XMcpCaptureRunner implements CaptureRunner {
  private readonly clientFactory: () => XMcpToolClient;
  private readonly now: () => string;

  constructor(options: XMcpCaptureRunnerOptions = {}) {
    const serverUrl = options.serverUrl ?? X_MCP_DEFAULT_URL;
    this.clientFactory = options.clientFactory ?? (() => new SdkXMcpToolClient(serverUrl, options.bearerToken));
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async captureRecentPosts(handle: string): Promise<CapturedAccountSnapshot> {
    const safeHandle = sanitizeHandle(handle);
    const capturedAt = this.now();
    const client = this.clientFactory();
    try {
      await client.connect();
      const userPayload = toolPayloadOrThrow(
        await client.callTool("get_users_by_username", {
          username: safeHandle,
          "user.fields": USER_FIELDS.join(",")
        })
      );
      const user = firstDataObject(userPayload);
      const userId = asString(user?.id);
      if (!user || !userId) throw new CaptureError("profile_not_found", `X MCP could not resolve @${safeHandle}`);

      const postsPayload = toolPayloadOrThrow(
        await client.callTool("get_users_posts", {
          id: userId,
          max_results: 25,
          exclude: "retweets,replies",
          "post.fields": TWEET_FIELDS.join(",")
        })
      );
      const username = asString(user.username) || safeHandle;
      const posts = dataArray(postsPayload)
        .filter((post) => !isRepostOrReply(post))
        .map((post): PostSnapshotInput | null => {
          const id = asString(post.id);
          const text = asString(post.text).trim();
          if (!id || !text) return null;
          return {
            xPostId: id,
            url: `https://x.com/${username}/status/${id}`,
            text,
            postedAt: asString(post.created_at) || null,
            capturedAt,
            source: "x_mcp",
            viewsCount: asNumber(post.public_metrics?.impression_count),
            likesCount: asNumber(post.public_metrics?.like_count),
            repostsCount: asNumber(post.public_metrics?.retweet_count),
            repliesCount: asNumber(post.public_metrics?.reply_count),
            bookmarksCount: asNumber(post.public_metrics?.bookmark_count)
          };
        })
        .filter((post): post is PostSnapshotInput => post !== null);

      const snapshot = normalizeCapturedSnapshot({
        profile: {
          handle: username,
          displayName: asString(user.name) || username,
          bio: asString(user.description),
          profileUrl: `https://x.com/${username}`,
          followersCount: asNumber(user.public_metrics?.followers_count),
          followingCount: asNumber(user.public_metrics?.following_count),
          capturedAt,
          source: "x_mcp"
        },
        posts
      });

      if (snapshot.posts.length === 0) {
        throw new CaptureError("profile_not_found", `X MCP returned no original posts for @${safeHandle}`);
      }
      return snapshot;
    } catch (error) {
      if (error instanceof CaptureError) throw error;
      throw new CaptureError("browser_not_reachable", error instanceof Error ? `X MCP capture failed: ${error.message}` : "X MCP capture failed");
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}

export function createXMcpCaptureRunnerFromEnv(env: NodeJS.ProcessEnv = process.env): XMcpCaptureRunner | null {
  const bearerToken = env.X_MCP_BEARER_TOKEN || env.X_BEARER_TOKEN || null;
  const serverUrl = env.X_MCP_SERVER_URL || (bearerToken ? X_MCP_DEFAULT_URL : "");
  if (!serverUrl) return null;
  return new XMcpCaptureRunner({ serverUrl, bearerToken });
}
