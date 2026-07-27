import type { AnalysisSummary } from "./analysis-schema";
import { buildDraftReadiness, type DraftReadiness } from "./draft-readiness";
import { evaluateDraftNovelty } from "./draft-novelty";
import type { GenerationOutput } from "./generation-schema";
import type { SelectedPostLabBrief } from "./post-lab";
import type { PostSnapshotInput } from "./types";

export type ProductionPlanSource = "selected-post" | "generated-draft" | "audit-idea";
export type ProductionPlanStatus = "Ready to copy" | "Needs full audit";

export interface ProductionPlanSlot {
  id: string;
  position: number;
  source: ProductionPlanSource;
  title: string;
  status: ProductionPlanStatus;
  timing: string;
  hook: string;
  draft: string;
  rationale: string;
  sourceSignal: string;
  actionLabel: string;
  readiness: DraftReadiness;
  noveltyLabel: string;
}

export interface PostProductionPlan {
  summary: string;
  primarySlotId: string | null;
  slots: ProductionPlanSlot[];
}

const MAX_PLAN_SLOTS = 5;

// The generation prompt asks for plain English, but models still emit "strategy.strongestLanes: x; workingPatterns: y".
// Strip key-path prefixes deterministically so raw field names never reach the UI or clipboard.
export function humanizeSourceSignal(signal: string): string {
  return signal
    .split(/;\s*/)
    .map((segment) => segment.replace(/^[\w$][\w.$]*\s*:\s*/, "").trim())
    .filter(Boolean)
    .join(" · ");
}

function selectedHook(brief: SelectedPostLabBrief) {
  return brief.variantHooks[0] ?? brief.rewrite ?? brief.sourceText;
}

function selectedDraft(brief: SelectedPostLabBrief) {
  return brief.rewrite ?? brief.sourceText;
}

function planSummary({
  hasSelectedPost,
  generationCount,
  visibleGenerationCount,
  auditIdeaCount,
  visibleAuditIdeaCount
}: {
  hasSelectedPost: boolean;
  generationCount: number;
  visibleGenerationCount: number;
  auditIdeaCount: number;
  visibleAuditIdeaCount: number;
}) {
  if (hasSelectedPost && generationCount > 0) {
    const generatedLabel =
      visibleGenerationCount === generationCount ? `${generationCount}` : `${visibleGenerationCount} of ${generationCount}`;
    return `Selected remix first, then ${generatedLabel} generated ${generationCount === 1 ? "draft" : "drafts"} as alternates.`;
  }
  if (hasSelectedPost) return "Selected-post remix queue. Start your next post from the ranked winner.";
  if (generationCount > 0) {
    const generatedLabel =
      visibleGenerationCount === generationCount ? `${generationCount}` : `${visibleGenerationCount} of ${generationCount}`;
    return `${generatedLabel} generated ${generationCount === 1 ? "draft" : "drafts"} ready for review.`;
  }
  if (auditIdeaCount > 0) {
    const ideaLabel =
      visibleAuditIdeaCount === auditIdeaCount ? "Audit idea queue" : `Audit idea queue showing ${visibleAuditIdeaCount} of ${auditIdeaCount}`;
    return `${ideaLabel}. Generate when ready, or copy the strongest starter draft now.`;
  }
  return "No production queue yet. Run an audit or generate drafts to create posting slots.";
}

function noveltyLabelFor(draft: string, publishedPosts: PostSnapshotInput[]) {
  return evaluateDraftNovelty(
    draft,
    publishedPosts.map((post) => post.text)
  ).label;
}

export function buildPostProductionPlan({
  analysis,
  generation,
  selectedPostBrief,
  capturedPosts = []
}: {
  analysis: AnalysisSummary | null;
  generation: GenerationOutput | null;
  selectedPostBrief?: SelectedPostLabBrief | null;
  capturedPosts?: PostSnapshotInput[];
}): PostProductionPlan {
  const slots: ProductionPlanSlot[] = [];

  if (selectedPostBrief) {
    const ready = Boolean(selectedPostBrief.rewrite);
    const hook = selectedHook(selectedPostBrief);
    const draft = selectedDraft(selectedPostBrief);
    const sourceSignal = selectedPostBrief.rankLabel;
    slots.push({
      id: `selected-${selectedPostBrief.postId}`,
      position: slots.length + 1,
      source: "selected-post",
      title: "Remix selected post",
      status: ready ? "Ready to copy" : "Needs full audit",
      timing: "Next post",
      hook,
      draft,
      rationale: `${selectedPostBrief.performanceRead} ${selectedPostBrief.recommendation}`,
      sourceSignal,
      actionLabel: ready ? "Copy rewrite" : "Copy source",
      readiness: buildDraftReadiness({ hook, draft, sourceSignal }),
      noveltyLabel: noveltyLabelFor(draft, capturedPosts)
    });
  }

  if (generation) {
    generation.posts.forEach((post, index) => {
      if (slots.length >= MAX_PLAN_SLOTS) return;
      slots.push({
        id: `generated-${index + 1}`,
        position: slots.length + 1,
        source: "generated-draft",
        title: post.title,
        status: "Ready to copy",
        timing: slots.length === 0 ? "Next post" : `Queue ${slots.length + 1}`,
        hook: post.hook,
        draft: post.draft,
        rationale: post.why_this,
        sourceSignal: humanizeSourceSignal(post.source_signal),
        actionLabel: "Copy draft",
        readiness: buildDraftReadiness({ hook: post.hook, draft: post.draft, sourceSignal: post.source_signal }),
        noveltyLabel: noveltyLabelFor(`${post.hook}\n${post.draft}`, capturedPosts)
      });
    });
  } else if (analysis) {
    analysis.next_post_ideas.forEach((idea, index) => {
      if (slots.length >= MAX_PLAN_SLOTS) return;
      slots.push({
        id: `audit-idea-${index + 1}`,
        position: slots.length + 1,
        source: "audit-idea",
        title: idea.title,
        status: "Ready to copy",
        timing: slots.length === 0 ? "Next post" : `Queue ${slots.length + 1}`,
        hook: idea.hook,
        draft: idea.draft,
        rationale: idea.reason,
        sourceSignal: "Audit next-post idea",
        actionLabel: "Copy idea draft",
        readiness: buildDraftReadiness({ hook: idea.hook, draft: idea.draft, sourceSignal: "Audit next-post idea" }),
        noveltyLabel: noveltyLabelFor(`${idea.hook}\n${idea.draft}`, capturedPosts)
      });
    });
  }

  return {
    summary: planSummary({
      hasSelectedPost: Boolean(selectedPostBrief),
      generationCount: generation?.posts.length ?? 0,
      visibleGenerationCount: slots.filter((slot) => slot.source === "generated-draft").length,
      auditIdeaCount: generation ? 0 : (analysis?.next_post_ideas.length ?? 0),
      visibleAuditIdeaCount: slots.filter((slot) => slot.source === "audit-idea").length
    }),
    primarySlotId: slots[0]?.id ?? null,
    slots
  };
}

export function formatPostProductionPlanForClipboard(plan: PostProductionPlan) {
  return [
    "Draft queue",
    plan.summary,
    "",
    ...plan.slots.map((slot) =>
      [
        `${slot.position}. ${slot.title} [${slot.status}]`,
        `Timing: ${slot.timing}`,
        `Hook: ${slot.hook}`,
        `Draft: ${slot.draft}`,
        `Readiness: ${slot.readiness.score} (${slot.readiness.verdict})`,
        `Novelty: ${slot.noveltyLabel}`,
        `Why: ${slot.rationale}`,
        `Source: ${slot.sourceSignal}`
      ].join("\n")
    )
  ].join("\n");
}
