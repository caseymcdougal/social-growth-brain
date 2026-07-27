import { buildDraftReadiness } from "./draft-readiness";
import type { GeneratedPost, GenerationOutput } from "./generation-schema";

const stopWords = new Set([
  "about",
  "after",
  "again",
  "because",
  "before",
  "being",
  "between",
  "does",
  "from",
  "have",
  "into",
  "just",
  "like",
  "more",
  "most",
  "that",
  "than",
  "their",
  "then",
  "there",
  "they",
  "this",
  "when",
  "with",
  "would",
  "your"
]);

/** Token-overlap / n-gram threshold above which a draft is treated as a near-duplicate. */
export const NOVELTY_REJECT_THRESHOLD = 0.48;

export type NoveltyVerdict = "novel" | "close";

export interface NoveltyMatch {
  score: number;
  against: string;
  reason: string;
}

export interface DraftNoveltyResult {
  verdict: NoveltyVerdict;
  score: number;
  match: NoveltyMatch | null;
  label: string;
}

export interface DraftGateReject {
  post: GeneratedPost;
  reasons: string[];
}

export interface DraftGateResult {
  accepted: GeneratedPost[];
  rejected: DraftGateReject[];
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function ngrams(tokens: string[], size: number) {
  if (tokens.length < size) return [] as string[];
  const grams: string[] = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    grams.push(tokens.slice(index, index + size).join(" "));
  }
  return grams;
}

/** Similarity of draft text against one corpus candidate (0–1). */
export function draftSimilarityScore(draft: string, candidate: string): number {
  const normalizedDraft = normalizeText(draft);
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedDraft || !normalizedCandidate) return 0;

  if (normalizedDraft.length > 24 && normalizedCandidate.includes(normalizedDraft)) return 1;
  if (normalizedCandidate.length > 24 && normalizedDraft.includes(normalizedCandidate)) {
    return Math.min(1, 0.72 + normalizedCandidate.length / Math.max(normalizedDraft.length, 1) / 4);
  }

  const draftTokens = tokenize(draft);
  const candidateTokens = new Set(tokenize(candidate));
  if (draftTokens.length === 0 || candidateTokens.size === 0) return 0;

  const overlapCount = draftTokens.filter((token) => candidateTokens.has(token)).length;
  const tokenOverlap = overlapCount / draftTokens.length;

  const draftGrams = new Set(ngrams(draftTokens, 4));
  const candidateGrams = new Set(ngrams(tokenize(candidate), 4));
  let sharedGrams = 0;
  for (const gram of draftGrams) {
    if (candidateGrams.has(gram)) sharedGrams += 1;
  }
  const gramOverlap = draftGrams.size === 0 ? 0 : sharedGrams / draftGrams.size;

  return Math.max(tokenOverlap, gramOverlap);
}

export function evaluateDraftNovelty(draft: string, corpus: string[]): DraftNoveltyResult {
  let best: NoveltyMatch | null = null;
  for (const candidate of corpus) {
    const score = draftSimilarityScore(draft, candidate);
    if (!best || score > best.score) {
      best = {
        score,
        against: candidate,
        reason:
          score >= NOVELTY_REJECT_THRESHOLD
            ? "Shares the same core claim, hook, or phrasing as a recent post or prior draft."
            : "Distinct enough from recent posts."
      };
    }
  }

  const score = best?.score ?? 0;
  const verdict: NoveltyVerdict = score >= NOVELTY_REJECT_THRESHOLD ? "close" : "novel";
  return {
    verdict,
    score,
    match: best,
    label: verdict === "novel" ? "Novel" : "Close to a recent post"
  };
}

function draftCorpusText(post: GeneratedPost) {
  return `${post.hook}\n${post.draft}`;
}

export function gateGeneratedPosts({
  posts,
  publishedTexts,
  priorDrafts
}: {
  posts: GeneratedPost[];
  publishedTexts: string[];
  priorDrafts: string[];
}): DraftGateResult {
  const accepted: GeneratedPost[] = [];
  const rejected: DraftGateReject[] = [];
  const siblingCorpus: string[] = [];

  for (const post of posts) {
    const reasons: string[] = [];
    const novelty = evaluateDraftNovelty(draftCorpusText(post), [
      ...publishedTexts,
      ...priorDrafts,
      ...siblingCorpus
    ]);
    if (novelty.verdict === "close") {
      reasons.push(novelty.match?.reason ?? "Too similar to a recent post or prior draft.");
    }

    const readiness = buildDraftReadiness({
      hook: post.hook,
      draft: post.draft,
      sourceSignal: post.source_signal
    });
    if (readiness.verdict !== "Ready") {
      reasons.push(...readiness.blockingFixes);
    }

    if (reasons.length > 0) {
      rejected.push({ post, reasons });
      continue;
    }

    accepted.push(post);
    siblingCorpus.push(draftCorpusText(post));
  }

  return { accepted, rejected };
}

/** Prefer accepted drafts; if too few, fill with least-duplicate rejects (readiness may still fail). */
export function selectDraftsAfterGate(gate: DraftGateResult, minCount = 3): GenerationOutput {
  const posts = [...gate.accepted];
  const target = Math.max(1, minCount);

  for (const reject of gate.rejected) {
    if (posts.length >= target) break;
    const againstSelected = posts.map((post) => draftCorpusText(post));
    const novelty = evaluateDraftNovelty(draftCorpusText(reject.post), againstSelected);
    if (novelty.verdict === "close" && posts.length > 0) continue;
    posts.push(reject.post);
  }

  if (posts.length === 0 && gate.rejected[0]) {
    posts.push(gate.rejected[0].post);
  }

  return { posts };
}

export function formatRepairNotes(rejected: DraftGateReject[]): string {
  if (rejected.length === 0) return "";
  return [
    "Previous drafts failed quality gates. Rewrite with genuinely new claims and paste-ready substance.",
    ...rejected.map((item, index) => {
      const preview = item.post.draft.replace(/\s+/g, " ").trim().slice(0, 120);
      return `${index + 1}. Rejected "${item.post.title}" (${preview}...): ${item.reasons.join(" ")}`;
    })
  ].join("\n");
}
