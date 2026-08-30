import { spawn } from "node:child_process";
import { normalizeCapturedSnapshot } from "../../shared/normalize";
import type { CapturedAccountSnapshot } from "../../shared/types";
import { CaptureError, type CaptureRunner } from "./capture-runner";

const CAPTURE_TIMEOUT_MS = 45_000;

function sanitizeHandle(handle: string) {
  return handle.replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15) || "caseymcdougal";
}

function extractionScript(handle: string) {
  const safeHandle = sanitizeHandle(handle);
  const profileUrl = `https://x.com/${safeHandle}`;
  const safeHandleJson = JSON.stringify(safeHandle);

  return `
_tab = new_tab(${JSON.stringify(profileUrl)})
wait_for_element("main", timeout=10.0, visible=True)
wait(2.0)
for _ in range(14):
  count = js("document.querySelectorAll('article[data-testid=\\\\\\"tweet\\\\\\"]').length")
  if count >= 40:
    break
  js("window.scrollBy(0, Math.round(window.innerHeight * 1.4))")
  wait(0.8)
data = js(r"""
(() => {
  const handle = ${safeHandleJson};
  const handleLower = handle.toLowerCase();
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
  const escapeRegExp = (value) => value.replace(/[|\\\\{}()[\\]^$+*?.]/g, "\\\\$&");
  const parseMetricFromLabelText = (raw, labels) => {
    if (!raw) return null;
    const labelPattern = labels.map(escapeRegExp).join("|");
    const numberPattern = "\\\\d[\\\\d,]*(?:\\\\.\\\\d+)?\\\\s*(?:[KMB])?";
    const countBeforeLabel = new RegExp("(" + numberPattern + ")\\\\s+(?:" + labelPattern + ")\\\\b", "i");
    const labelBeforeCount = new RegExp("(?:" + labelPattern + ")\\\\b[^\\\\d]{0,32}(" + numberPattern + ")", "i");
    return parseCount(raw.match(countBeforeLabel)?.[1] || raw.match(labelBeforeCount)?.[1]);
  };
  const metricCandidates = (article, selectors) => {
    const values = [
      article.getAttribute("aria-label"),
      article.innerText,
      ...Array.from(article.querySelectorAll("[aria-label]")).map((node) => node.getAttribute("aria-label")),
      ...Array.from(article.querySelectorAll('[role="group"][aria-label]')).map((node) => node.getAttribute("aria-label"))
    ];
    for (const selector of selectors) {
      const node = article.querySelector(selector);
      const clickable = node?.closest('[role="button"], a');
      values.push(node?.getAttribute("aria-label"), clickable?.getAttribute("aria-label"), text(node), text(clickable));
    }
    return values.filter(Boolean).join(" · ");
  };
  const metric = (article, labels, selectors = []) => parseMetricFromLabelText(metricCandidates(article, selectors), labels);
  const profileStat = (pathSuffixes, labels) => {
    const suffixes = Array.isArray(pathSuffixes) ? pathSuffixes : [pathSuffixes];
    const anchors = Array.from(document.querySelectorAll("main a[href]"));
    for (const anchor of anchors) {
      try {
        const url = new URL(anchor.href, location.href);
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts[0]?.toLowerCase() !== handleLower || !suffixes.includes(parts[1])) continue;

        const raw = [anchor.getAttribute("aria-label"), text(anchor)].filter(Boolean).join(" · ");
        const count = parseMetricFromLabelText(raw, labels) ?? parseCount(raw);
        if (count !== null) return count;
      } catch {
        continue;
      }
    }
    return null;
  };
  const profile = {
    handle,
    displayName: document.querySelector('[data-testid="UserName"]')?.innerText?.split("\\\\n")[0] || handle,
    bio: document.querySelector('[data-testid="UserDescription"]')?.innerText || "",
    profileUrl: location.href.split("?")[0],
    followersCount: profileStat(["followers", "verified_followers"], ["follower", "followers"]),
    followingCount: profileStat("following", ["following"]),
    capturedAt,
    source: "browser"
  };
  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  const posts = [];
  for (const article of articles) {
    const socialContext = text(article.querySelector('[data-testid="socialContext"]'));
    if (/reposted|retweeted/i.test(socialContext)) continue;
    const tweetText = text(article.querySelector('[data-testid="tweetText"]'));
    const link = Array.from(article.querySelectorAll('a'))
      .map((anchor) => anchor.href)
      .find((href) => {
        try {
          const url = new URL(href);
          const parts = url.pathname.split("/").filter(Boolean);
          return parts[0]?.toLowerCase() === handleLower && parts[1] === "status" && /^\\d+$/.test(parts[2] || "");
        } catch {
          return false;
        }
      });
    if (!tweetText || !link) continue;
    const statusMatch = link.match(/status\\/(\\d+)/);
    posts.push({
      xPostId: statusMatch?.[1] || link,
      url: link,
      text: tweetText,
      postedAt: article.querySelector("time")?.getAttribute("datetime") || null,
      capturedAt,
      source: "browser",
      viewsCount: metric(article, ["view", "views"], ['a[href$="/analytics"]', 'a[aria-label*="view" i]', 'a[aria-label*="analytics" i]']),
      likesCount: metric(article, ["like", "likes"], ['[data-testid="like"]', '[aria-label*="like" i]']),
      repostsCount: metric(article, ["repost", "reposts"], ['[data-testid="retweet"]', '[aria-label*="repost" i]']),
      repliesCount: metric(article, ["reply", "replies"], ['[data-testid="reply"]', '[aria-label*="reply" i]']),
      bookmarksCount: metric(article, ["bookmark", "bookmarks"], ['[data-testid="bookmark"]', '[aria-label*="bookmark" i]'])
    });
    if (posts.length >= 25) break;
  }
  return { profile, posts };
})()
""")
import json
print(json.dumps(data))
try:
  close_tab(_tab)
except Exception:
  pass
`;
}

export class BrowserHarnessXCaptureRunner implements CaptureRunner {
  async captureRecentPosts(handle: string): Promise<CapturedAccountSnapshot> {
    const script = extractionScript(handle);
    const raw = await new Promise<string>((resolve, reject) => {
      const browserHarnessBin = process.env.BROWSER_HARNESS_BIN || "browser-harness";
      const child = spawn(browserHarnessBin, ["-c", script], { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        reject(new CaptureError("browser_not_reachable", "X capture timed out after 45 seconds"));
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
    return normalized;
  }
}
