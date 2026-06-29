export type DraftReadinessVerdict = "Ready" | "Needs work";

export interface DraftReadinessCheck {
  label: string;
  passed: boolean;
  detail: string;
  fix: string;
}

export interface DraftReadiness {
  score: number;
  verdict: DraftReadinessVerdict;
  checks: DraftReadinessCheck[];
  blockingFixes: string[];
}

const proofPattern = /\b(\d+|%|x\b|posts?\b|views?\b|likes?\b|replies?\b|bookmarks?\b|tested\b|example\b|specific\b|named\b|because\b)/i;
const actionPattern = /\b(should|try|ask|reply|decide|choose|use|build|test|ship|write|recommend|question|what would|which)\b|[?]/i;
const vaguePattern = /\b(everything|honestly|really|motivating|interesting|amazing|game changer|pay attention|the future)\b/i;

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function checkHook(hook: string): DraftReadinessCheck {
  const trimmedHook = hook.trim();
  const passed = trimmedHook.length >= 24 && !vaguePattern.test(trimmedHook);
  return {
    label: "Hook strength",
    passed,
    detail: passed ? "The opening names a clear tension or claim." : "The opening is too vague to create a reason to keep reading.",
    fix: "Rewrite the first sentence with a sharper enemy, promise, or contradiction."
  };
}

function checkEvidence(draft: string, sourceSignal: string): DraftReadinessCheck {
  const passed = proofPattern.test(`${draft} ${sourceSignal}`);
  return {
    label: "Concrete evidence",
    passed,
    detail: passed ? "The draft carries a number, named example, or observable signal." : "The claim needs proof before it earns trust.",
    fix: "Add concrete proof: a number, named example, or specific observation."
  };
}

function checkActionPath(draft: string): DraftReadinessCheck {
  const passed = actionPattern.test(draft);
  return {
    label: "Action path",
    passed,
    detail: passed ? "The reader has a next action, question, or decision frame." : "The post ends as commentary instead of a usable prompt.",
    fix: "Give the reader a clear next action, question, or decision frame."
  };
}

function checkLength(draft: string): DraftReadinessCheck {
  const words = wordCount(draft);
  const passed = words >= 18 && words <= 75;
  return {
    label: "Post length",
    passed,
    detail: passed ? `${words} words is scannable for X.` : `${words} words needs tightening or more substance.`,
    fix: words < 18 ? "Add one concrete detail so the post is not just a hook." : "Cut the draft to one claim, one proof point, and one action."
  };
}

export function buildDraftReadiness({
  hook,
  draft,
  sourceSignal
}: {
  hook: string;
  draft: string;
  sourceSignal: string;
}): DraftReadiness {
  const checks = [checkHook(hook), checkEvidence(draft, sourceSignal), checkActionPath(draft), checkLength(draft)];
  const score = checks.reduce((total, check) => total + (check.passed ? 25 : 0), 0);
  const blockingFixes = checks.filter((check) => !check.passed).map((check) => check.fix);

  return {
    score,
    verdict: score >= 75 ? "Ready" : "Needs work",
    checks,
    blockingFixes
  };
}

export function formatDraftReadinessForClipboard(readiness: DraftReadiness) {
  return [
    "Draft readiness",
    `Score: ${readiness.score}`,
    `Verdict: ${readiness.verdict}`,
    "",
    ...readiness.checks.map((check) => `${check.label}: ${check.passed ? "pass" : "fix"} - ${check.detail}`),
    readiness.blockingFixes.length ? "" : null,
    ...readiness.blockingFixes.map((fix) => `Fix: ${fix}`)
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
