export const auditSteps = [
  { key: "scan", label: "See your posts", detail: "How your recent posts did", target: "next-move-title" },
  { key: "rank", label: "Find what worked", detail: "What resonated most", target: "post-breakdown-title" },
  { key: "diagnose", label: "Understand why", detail: "The pattern behind your best posts", target: "coach-report-title" },
  { key: "write", label: "Write your next post", detail: "Draft something that fits", target: "next-posts-title" }
] as const;

export type AuditStepKey = (typeof auditSteps)[number]["key"];

export const heroPhaseSteps = ["See", "Find", "Understand", "Write"] as const;

export const cta = {
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
  evidence: "How complete your post data is. Better data means better advice.",
  momentum: "Whether your posts are getting more traction over time.",
  strategy: "Whether you've turned patterns into a repeatable plan.",
  production: "Whether you have drafts ready to post."
} as const;

export const emptyStatePreview = [
  "See which posts got the most traction",
  "Learn the pattern behind your best work",
  "Get draft ideas you can copy into X"
] as const;