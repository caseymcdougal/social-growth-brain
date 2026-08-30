export const auditSteps = [
  { key: "scan", label: "See your posts", detail: "How your recent posts did", target: "next-move-title" },
  { key: "rank", label: "Find what worked", detail: "What resonated most", target: "post-breakdown-title" },
  { key: "diagnose", label: "Understand why", detail: "The pattern behind your best posts", target: "coach-report-title" },
  { key: "write", label: "Write your next post", detail: "Draft something that fits", target: "next-posts-title" }
] as const;

export type AuditStepKey = (typeof auditSteps)[number]["key"];

export const heroPhaseSteps = ["See", "Find", "Understand", "Write"] as const;

export const cta = {
  runFullAudit: "Run my audit",
  fullAuditHint: "Scans your posts, finds the patterns, and writes drafts in one go. Takes a few minutes.",
  scanPosts: "Scan my posts",
  scanning: "Scanning…",
  pasteSnapshot: "Paste snapshot instead",
  findPatterns: "Find what's working",
  analyzing: "Finding patterns…",
  writeDrafts: "Write draft ideas",
  writing: "Writing…",
  runAuditAgain: "Find patterns again",
  scanAgain: "Scan again",
  seeDrafts: "See my drafts",
  writeNewIdeas: "Write new ideas"
} as const;

export const scorecardDimensionHints = {
  profile: "Based on your live name, handle, and bio. It does not score follower growth.",
  performance: "Based on recent post views and public actions: likes, replies, reposts, and bookmarks.",
  evidence: "How complete your post data is. Better data means better advice."
} as const;

export const emptyStatePreview = [
  "See which posts got the most traction",
  "Learn the pattern behind your best work",
  "Get draft ideas you can copy into X"
] as const;
