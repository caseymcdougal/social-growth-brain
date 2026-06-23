import { spawn } from "node:child_process";
import { normalizeCapturedSnapshot } from "../../shared/normalize";
import type { CapturedAccountSnapshot } from "../../shared/types";
import { CaptureError, type CaptureRunner } from "./capture-runner";

const CAPTURE_TIMEOUT_MS = 120_000;

function sanitizeHandle(handle: string) {
  return handle.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15) || "caseymcdougal";
}

function extractionScript(handle: string) {
  const safeHandle = sanitizeHandle(handle);
  const profileUrl = `https://x.com/${safeHandle}`;
  const safeHandleJson = JSON.stringify(safeHandle);

  return `
new_tab(${JSON.stringify(profileUrl)})
wait_for_load()
data = js("""
(() => {
  const handle = ${safeHandleJson};
  const capturedAt = new Date().toISOString();
  const text = (node) => (node?.innerText || node?.textContent || "").trim();
  if (/\\/i\\/flow\\/login/.test(location.pathname) || /Log in to X|Sign in to X/i.test(document.body.innerText || "")) {
    return { errorStage: "x_not_logged_in", errorMessage: "X is asking for login in the connected browser session" };
  }
  const parseCount = (raw) => {
    if (!raw) return null;
    const cleaned = String(raw).replace(/,/g, "").trim();
    const match = cleaned.match(/(\\d+(?:\\.\\d+)?)(?:\\s*([KMB])\\b)?/i);
    if (!match) return null;
    const base = Number(match[1]);
    if (!Number.isFinite(base)) return null;
    const suffix = match[2]?.toUpperCase();
    const multiplier = suffix === "K" ? 1000 : suffix === "M" ? 1000000 : suffix === "B" ? 1000000000 : 1;
    return Math.round(base * multiplier);
  };
  const profile = {
    handle,
    displayName: document.querySelector('[data-testid="UserName"]')?.innerText?.split("\\n")[0] || handle,
    bio: document.querySelector('[data-testid="UserDescription"]')?.innerText || "",
    profileUrl: location.href.split("?")[0],
    followersCount: null,
    followingCount: null,
    capturedAt,
    source: "browser"
  };
  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  const posts = [];
  for (const article of articles) {
    const tweetText = text(article.querySelector('[data-testid="tweetText"]'));
    const link = Array.from(article.querySelectorAll('a'))
      .map((anchor) => anchor.href)
      .find((href) => /\\/status\\/\\d+/.test(href));
    if (!tweetText || !link) continue;
    const statusMatch = link.match(/status\\/(\\d+)/);
    const aria = article.getAttribute("aria-label") || article.innerText || "";
    const metric = (label) => {
      const match = aria.match(new RegExp("(\\\\d+(?:\\\\.\\\\d+)?[KMB]?)\\\\s+" + label, "i"));
      return match ? parseCount(match[1]) : null;
    };
    posts.push({
      xPostId: statusMatch?.[1] || link,
      url: link,
      text: tweetText,
      postedAt: article.querySelector("time")?.getAttribute("datetime") || null,
      capturedAt,
      source: "browser",
      viewsCount: metric("views?"),
      likesCount: metric("likes?"),
      repostsCount: metric("reposts?"),
      repliesCount: metric("repl(?:y|ies)"),
      bookmarksCount: metric("bookmarks?")
    });
    if (posts.length >= 25) break;
  }
  return { profile, posts };
})()
""")
import json
print(json.dumps(data))
`;
}

export class BrowserHarnessXCaptureRunner implements CaptureRunner {
  async captureRecentPosts(handle: string): Promise<CapturedAccountSnapshot> {
    const script = extractionScript(handle);
    const raw = await new Promise<string>((resolve, reject) => {
      const child = spawn("browser-harness", ["-c", script], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        reject(new CaptureError("browser_not_reachable", "browser-harness capture timed out"));
      }, CAPTURE_TIMEOUT_MS);

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new CaptureError("browser_not_reachable", "browser-harness is unavailable"));
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (code === 0) {
          resolve(stdout);
          return;
        }
        reject(new CaptureError("browser_not_reachable", stderr || `browser-harness exited with ${code}`));
      });
    });

    const jsonLine = raw.trim().split("\n").filter(Boolean).at(-1);
    if (!jsonLine) throw new CaptureError("parser_failed", "browser-harness returned no JSON");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonLine);
    } catch (error) {
      throw new CaptureError("parser_failed", error instanceof Error ? error.message : "Capture JSON parse failed");
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "errorStage" in parsed &&
      (parsed as { errorStage?: unknown }).errorStage === "x_not_logged_in"
    ) {
      const message =
        "errorMessage" in parsed && typeof (parsed as { errorMessage?: unknown }).errorMessage === "string"
          ? (parsed as { errorMessage: string }).errorMessage
          : "X is asking for login in the connected browser session";
      throw new CaptureError("x_not_logged_in", message);
    }

    const normalized = normalizeCapturedSnapshot(parsed as CapturedAccountSnapshot);
    if (normalized.posts.length === 0) {
      throw new CaptureError("profile_not_found", "No original posts found on the profile page");
    }
    if (normalized.posts.length < 5) {
      throw new CaptureError("not_enough_posts", "Fewer than 5 posts were captured");
    }
    return normalized;
  }
}
