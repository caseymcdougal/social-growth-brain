import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Lightbulb,
  ListPlus,
  PenLine,
  RotateCcw,
  Sparkles,
  Target
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AnalysisSummary } from "../../shared/analysis-schema";
import type { GenerationOutput } from "../../shared/generation-schema";
import { formatSelectedPostLabBriefForClipboard, type SelectedPostLabBrief } from "../../shared/post-lab";
import { buildProductionOutcomeLoop } from "../../shared/production-outcomes";
import {
  buildPostProductionPlan,
  formatPostProductionPlanForClipboard,
  type ProductionPlanSlot
} from "../../shared/post-production-plan";
import {
  getProductionWorkflowSummary,
  getSlotWorkflowStatus,
  pruneProductionWorkflowState,
  setSlotWorkflowStatus,
  type ProductionWorkflowState,
  type ProductionWorkflowStatus
} from "../../shared/production-workflow";
import type { PostSnapshotInput } from "../../shared/types";
import { formatPostingWindow } from "../postingWindow";

const queue = [
  { icon: Target, label: "Audit", value: "Run strategy audit" },
  { icon: Sparkles, label: "Generate", value: "Today's ideas" },
  { icon: Copy, label: "Export", value: "Copy drafts into X" }
];

const workflowStorageKey = "social-audit-production-workflow-v1";
const workflowStatuses = new Set(["planned", "used", "skipped"]);

function readStoredWorkflowState(): ProductionWorkflowState {
  try {
    const rawState = window.localStorage.getItem(workflowStorageKey);
    if (!rawState) return {};
    const parsedState = JSON.parse(rawState);
    if (!parsedState || typeof parsedState !== "object" || Array.isArray(parsedState)) return {};
    return Object.fromEntries(
      Object.entries(parsedState).filter((entry): entry is [string, ProductionWorkflowState[string]] => {
        const [slotId, status] = entry;
        return typeof slotId === "string" && typeof status === "string" && workflowStatuses.has(status);
      })
    );
  } catch {
    return {};
  }
}

function storeWorkflowState(state: ProductionWorkflowState) {
  try {
    window.localStorage.setItem(workflowStorageKey, JSON.stringify(state));
  } catch {
    // This is local convenience state; clipboard and drafting still work without it.
  }
}

function workflowLabel(status: ProductionWorkflowStatus) {
  if (status === "open") return "Open";
  if (status === "planned") return "Planned";
  if (status === "used") return "Used";
  return "Skipped";
}

function workflowStatesMatch(left: ProductionWorkflowState, right: ProductionWorkflowState) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length && leftEntries.every(([slotId, status]) => right[slotId] === status);
}

export function NextPostQueue({
  analysis,
  generation,
  capturedPosts,
  selectedPostBrief
}: {
  analysis: AnalysisSummary | null;
  generation: GenerationOutput | null;
  capturedPosts: PostSnapshotInput[];
  selectedPostBrief?: SelectedPostLabBrief | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState<ProductionWorkflowState>(() => readStoredWorkflowState());
  const title = selectedPostBrief ? "Selected post lab" : generation ? "Drafts for today" : analysis ? "Create the next post" : "Audit first, then write";
  const status = selectedPostBrief
    ? "Selected"
    : generation
      ? `${generation.posts.length} ${generation.posts.length === 1 ? "draft" : "drafts"}`
      : analysis
        ? "Read ready"
        : "Locked";
  const lead = selectedPostBrief
    ? "Use the selected ranked post as a source object: copy the rewrite, remix brief, or hook variants without leaving the cockpit."
    : generation
    ? "Review the hooks, pick the sharpest angle, and copy the draft into X when it feels true."
    : analysis
      ? "The audit has enough signal to turn into a post. Use the brief below, then generate drafts from the top command."
      : "Scan public metrics and run the strategy read before choosing the next post.";
  const featuredDraft = generation?.posts[0] ?? null;
  const featuredIdea = analysis?.next_post_ideas[0] ?? null;
  const leadAngle = featuredDraft?.angle ?? featuredIdea?.title ?? null;
  const leadHook = featuredDraft?.hook ?? featuredIdea?.hook ?? null;
  const leadWhy = featuredDraft?.why_this ?? featuredIdea?.reason ?? null;
  const postingWindow = formatPostingWindow();
  const productionPlan = buildPostProductionPlan({ analysis, generation, selectedPostBrief });
  const activeSlotIds = useMemo(
    () => productionPlan.slots.map((slot) => slot.id),
    [productionPlan.primarySlotId, productionPlan.slots.length]
  );
  const activeSlotKey = activeSlotIds.join("|");
  const workflowSummary = getProductionWorkflowSummary(activeSlotIds, workflowState);
  const outcomeLoop = buildProductionOutcomeLoop({ productionPlan, workflowState, capturedPosts });
  const visibleSlots = [...productionPlan.slots].sort((left, right) => {
    const leftSkipped = getSlotWorkflowStatus(workflowState, left.id) === "skipped";
    const rightSkipped = getSlotWorkflowStatus(workflowState, right.id) === "skipped";
    if (leftSkipped !== rightSkipped) return leftSkipped ? 1 : -1;
    return left.position - right.position;
  });
  const primarySlot = visibleSlots[0] ?? null;
  const backlogSlots = visibleSlots.slice(1);
  const backlogLabel = `${backlogSlots.length} alternate ${backlogSlots.length === 1 ? "slot" : "slots"}`;
  const auditIdeaCount = analysis?.next_post_ideas.length ?? 0;
  const auditIdeaLabel = `${auditIdeaCount} audit ${auditIdeaCount === 1 ? "idea" : "ideas"}`;
  const shouldShowDraftLibrary = Boolean(generation && generation.posts.length > 1);
  const generatedDraftLabel = generation
    ? `${generation.posts.length} generated ${generation.posts.length === 1 ? "draft" : "drafts"}`
    : null;
  const workflowTrackerLabel = `Open ${workflowSummary.open} · planned ${workflowSummary.planned} · used ${workflowSummary.used} · skipped ${workflowSummary.skipped}`;
  const workflowTrackerOpen = workflowSummary.planned > 0 || workflowSummary.used > 0 || outcomeLoop.entries.length > 0;
  const workflowHasActivity = workflowTrackerOpen || workflowSummary.skipped > 0;
  const workflowTrackerGuidance = workflowTrackerOpen
    ? "Open because this queue has active workflow history."
    : "Closed until you plan, use, or measure a slot.";

  useEffect(() => {
    if (activeSlotIds.length === 0) return;
    setWorkflowState((currentState) => {
      const prunedState = pruneProductionWorkflowState(activeSlotIds, currentState);
      if (workflowStatesMatch(currentState, prunedState)) return currentState;
      storeWorkflowState(prunedState);
      return prunedState;
    });
  }, [activeSlotKey]);

  async function copyText(id: string, text: string) {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopyFailed(null);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1400);
    } catch {
      setCopied(null);
      setCopyFailed(id);
      window.setTimeout(() => setCopyFailed((current) => (current === id ? null : current)), 1800);
    }
  }

  function updateSlotWorkflow(slotId: string, status: ProductionWorkflowStatus) {
    setWorkflowState((currentState) => {
      const nextState = setSlotWorkflowStatus(currentState, slotId, status);
      storeWorkflowState(nextState);
      return nextState;
    });
  }

  function renderProductionSlot(
    slot: ProductionPlanSlot,
    display: { position?: number; timing?: string } = {}
  ) {
    const workflowStatus = getSlotWorkflowStatus(workflowState, slot.id);
    return (
      <li className="production-slot" data-source={slot.source} data-workflow={workflowStatus} key={slot.id}>
        <div className="production-slot-index" aria-hidden="true">
          {String(display.position ?? slot.position).padStart(2, "0")}
        </div>
        <div className="production-slot-body">
          <div className="production-slot-topline">
            <span>{display.timing ?? slot.timing}</span>
            <span>{slot.status}</span>
            <span>{workflowLabel(workflowStatus)}</span>
          </div>
          <strong>{slot.title}</strong>
          <p className="production-hook">{slot.hook}</p>
          <p className="production-draft">{slot.draft}</p>
          <details className="draft-support" aria-label={`Draft support for ${slot.title}`}>
            <summary>
              <span>Draft support</span>
              <strong>
                Readiness {slot.readiness.score} · {slot.readiness.verdict}
              </strong>
              <small>Open for source signal, rationale, checks, and fixes.</small>
            </summary>
            <small className="production-support-note">
              {slot.sourceSignal} · {slot.rationale}
            </small>
            <div className="draft-readiness" aria-label={`Draft readiness for ${slot.title}`}>
              <div className="draft-readiness-head">
                <span>Readiness {slot.readiness.score}</span>
                <strong>{slot.readiness.verdict}</strong>
              </div>
              <div className="draft-readiness-checks">
                {slot.readiness.checks.map((check) => (
                  <span data-passed={check.passed ? "true" : "false"} key={check.label}>
                    {check.label}
                  </span>
                ))}
              </div>
              {slot.readiness.blockingFixes.length > 0 && (
                <ul className="draft-readiness-fixes">
                  {slot.readiness.blockingFixes.map((fix) => (
                    <li key={fix}>{fix}</li>
                  ))}
                </ul>
              )}
            </div>
          </details>
          <div className="production-workflow-actions">
            {workflowStatus === "open" && (
              <button className="workflow-button" type="button" onClick={() => updateSlotWorkflow(slot.id, "planned")}>
                <ListPlus size={14} aria-hidden="true" />
                Plan slot
              </button>
            )}
            {workflowStatus === "planned" && (
              <>
                <button className="workflow-button" type="button" onClick={() => updateSlotWorkflow(slot.id, "used")}>
                  <CheckCircle2 size={14} aria-hidden="true" />
                  Mark used
                </button>
                <button className="workflow-button" type="button" onClick={() => updateSlotWorkflow(slot.id, "skipped")}>
                  <Ban size={14} aria-hidden="true" />
                  Skip
                </button>
              </>
            )}
            {workflowStatus !== "open" && (
              <button className="workflow-button" type="button" onClick={() => updateSlotWorkflow(slot.id, "open")}>
                <RotateCcw size={14} aria-hidden="true" />
                Reopen
              </button>
            )}
            <button className="copy-button" type="button" onClick={() => void copyText(`production-slot-${slot.id}`, slot.draft)}>
              {copied === `production-slot-${slot.id}` ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copied === `production-slot-${slot.id}`
                ? "Copied"
                : copyFailed === `production-slot-${slot.id}`
                  ? "Copy unavailable"
                  : slot.actionLabel}
            </button>
          </div>
        </div>
      </li>
    );
  }

  const postingBriefGrid = analysis ? (
    <div className="posting-brief-grid">
      <article>
        <span>Lead with</span>
        <strong>{leadAngle}</strong>
      </article>
      <article>
        <span>Opening hook</span>
        <strong>{leadHook}</strong>
      </article>
      <article className="posting-brief-wide">
        <span>Reason</span>
        <strong>{leadWhy}</strong>
      </article>
      <article className="posting-brief-wide posting-window-card">
        <span>Post window</span>
        <strong>{postingWindow}</strong>
        <small>Heuristic timing cue. Confirm it against the next scan.</small>
      </article>
    </div>
  ) : null;

  const postingBrief = analysis ? (
    generation && !selectedPostBrief ? (
      <details className="posting-brief-disclosure" aria-label="Recommended posting brief">
        <summary>
          <span>Posting brief</span>
          <strong>{leadAngle}</strong>
          <small>Open for the lead angle, hook, reason, and timing cue behind the draft.</small>
        </summary>
        {postingBriefGrid}
      </details>
    ) : (
      <div aria-label="Recommended posting brief">{postingBriefGrid}</div>
    )
  ) : null;

  const productionQueue =
    productionPlan.slots.length > 0 ? (
      <section className="production-queue" aria-label="Post production queue">
        <div className="production-queue-head">
          <div>
            <p className="eyebrow">Production Plan</p>
            <h3>Production queue</h3>
            <p>{productionPlan.summary}</p>
          </div>
          <button
            className="copy-button"
            type="button"
            onClick={() => void copyText("production-plan", formatPostProductionPlanForClipboard(productionPlan))}
          >
            {copied === "production-plan" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied === "production-plan"
              ? "Copied"
              : copyFailed === "production-plan"
                ? "Copy unavailable"
                : "Copy production plan"}
          </button>
        </div>
        <ol className="production-slot-list production-primary-slot-list">
          {primarySlot && renderProductionSlot(primarySlot, { position: 1, timing: "Next post" })}
        </ol>
        {workflowHasActivity && (
        <details className="production-workflow-panel" aria-label="Production workflow tracker" open={workflowTrackerOpen}>
          <summary>
            <span>Workflow tracker</span>
            <strong>{workflowTrackerLabel}</strong>
            <small>{workflowTrackerGuidance}</small>
          </summary>
          <div className="production-workboard" aria-label="Production workboard">
            <span>Open {workflowSummary.open}</span>
            <span>Planned {workflowSummary.planned}</span>
            <span>Used {workflowSummary.used}</span>
            <span>Skipped {workflowSummary.skipped}</span>
          </div>
          <section className="production-outcome-loop" aria-label="Production outcome loop">
            <div className="production-outcome-head">
              <div>
                <span>Learning loop</span>
                <strong>{outcomeLoop.summary}</strong>
              </div>
              <small>{outcomeLoop.nextAction}</small>
            </div>
            {outcomeLoop.entries.length > 0 && (
              <div className="production-outcome-list">
                {outcomeLoop.entries.map((entry) => (
                  <article className="production-outcome-entry" data-status={entry.status} key={entry.slotId}>
                    <div className="production-outcome-topline">
                      <span>{entry.label}</span>
                      {entry.visibleScore !== null && <span>Signal {Math.round(entry.visibleScore)}</span>}
                    </div>
                    <strong>{entry.slotTitle}</strong>
                    <p>{entry.metricsLabel}</p>
                    <small>{entry.detail}</small>
                    {entry.postUrl && (
                      <a className="production-outcome-link" href={entry.postUrl} rel="noreferrer" target="_blank">
                        <ExternalLink size={14} aria-hidden="true" />
                        Open post
                      </a>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </details>
        )}
        {backlogSlots.length > 0 && (
          <details className="production-backlog" aria-label="Queue backlog">
            <summary>
              <span>Queue backlog</span>
              <strong>{backlogLabel}</strong>
              <small>Open when you want to inspect or work the alternates.</small>
            </summary>
            <ol className="production-slot-list production-backlog-list">
              {backlogSlots.map((slot, index) =>
                renderProductionSlot(slot, { position: index + 2, timing: `Queue ${index + 2}` })
              )}
            </ol>
          </details>
        )}
      </section>
    ) : null;

  return (
    <section className="panel next-posts" aria-labelledby="next-posts-title">
      <div className="section-head post-lab-head">
        <div>
          <p className="eyebrow">Post Lab</p>
          <h2 id="next-posts-title">{title}</h2>
        </div>
        <span className="status-chip">{status}</span>
      </div>
      <p className="post-lab-lead">{lead}</p>

      {selectedPostBrief && (
        <div className="selected-post-lab" aria-label="Selected post workspace">
          <div className="selected-post-source">
            <span>{selectedPostBrief.rankLabel}</span>
            <p>{selectedPostBrief.sourceText}</p>
          </div>
          <div className="selected-post-grid">
            <article>
              <span>Action</span>
              <strong>{selectedPostBrief.primaryAction}</strong>
              <small>{selectedPostBrief.performanceRead}</small>
            </article>
            <article>
              <span>Change</span>
              <strong>{selectedPostBrief.recommendation}</strong>
            </article>
            {selectedPostBrief.rewrite && (
              <article className="selected-post-wide">
                <span>Rewrite</span>
                <strong>{selectedPostBrief.rewrite}</strong>
              </article>
            )}
          </div>
          {selectedPostBrief.variantHooks.length > 0 && (
            <div className="selected-hook-row" aria-label="Selected post hook variants">
              {selectedPostBrief.variantHooks.map((hook) => (
                <span key={hook}>{hook}</span>
              ))}
            </div>
          )}
          <div className="selected-post-actions">
            <button
              className="copy-button"
              type="button"
              onClick={() =>
                void copyText(`selected-brief-${selectedPostBrief.postId}`, formatSelectedPostLabBriefForClipboard(selectedPostBrief))
              }
            >
              {copied === `selected-brief-${selectedPostBrief.postId}` ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )}
              {copied === `selected-brief-${selectedPostBrief.postId}`
                ? "Copied"
                : copyFailed === `selected-brief-${selectedPostBrief.postId}`
                  ? "Copy unavailable"
                  : "Copy remix brief"}
            </button>
            {selectedPostBrief.rewrite && (
              <button
                className="copy-button"
                type="button"
                onClick={() => void copyText(`selected-rewrite-${selectedPostBrief.postId}`, selectedPostBrief.rewrite ?? "")}
              >
                {copied === `selected-rewrite-${selectedPostBrief.postId}` ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
                {copied === `selected-rewrite-${selectedPostBrief.postId}`
                  ? "Copied"
                  : copyFailed === `selected-rewrite-${selectedPostBrief.postId}`
                    ? "Copy unavailable"
                    : "Copy rewrite"}
              </button>
            )}
          </div>
        </div>
      )}

      {generation && !selectedPostBrief ? (
        <>
          {productionQueue}
          {postingBrief}
        </>
      ) : (
        <>
          {postingBrief}
          {productionQueue}
        </>
      )}

      {!analysis && (
        <div className="idea-list">
          {queue.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label}>
                <Icon size={17} aria-hidden="true" />
                <div>
                  <span>{item.label}</span>
                  <p>{item.value}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {analysis && !generation && (
        <details className="draft-library idea-backlog" aria-label="Audit idea backlog">
          <summary>
            <span>Idea backlog</span>
            <strong>{auditIdeaLabel}</strong>
            <small>Open only when you want to compare every audit suggestion.</small>
          </summary>
          <div className="idea-list starter-list">
            {analysis.next_post_ideas.map((idea) => (
              <article className="idea-card" key={idea.title}>
                <Lightbulb size={17} aria-hidden="true" />
                <div>
                  <span>{idea.title}</span>
                  <p className="idea-hook">{idea.hook}</p>
                  <p className="idea-draft idea-draft-preview">{idea.draft}</p>
                  <small>{idea.reason}</small>
                </div>
              </article>
            ))}
          </div>
        </details>
      )}

      {shouldShowDraftLibrary && generation && (
        <details className="draft-library" aria-label="Draft library">
          <summary>
            <span>Draft library</span>
            <strong>{generatedDraftLabel}</strong>
            <small>Open only when you want to browse every raw draft.</small>
          </summary>
          <div className="idea-list generated-list">
            {generation.posts.map((post, index) => {
              const copyId = `${post.title}-${index}`;
              return (
                <article
                  className={
                    index === 0 ? "idea-card generated-post-card featured-post-card" : "idea-card generated-post-card"
                  }
                  key={copyId}
                >
                  <PenLine size={17} aria-hidden="true" />
                  <div>
                    <span>{index === 0 ? `Recommended · ${post.title}` : post.title}</span>
                    <p className="idea-hook">{post.hook}</p>
                    <small>{post.angle}</small>
                    <p className="source-signal">{post.source_signal}</p>
                    <p className="idea-draft">{post.draft}</p>
                    <small>{post.why_this}</small>
                    <button className="copy-button" type="button" onClick={() => void copyText(copyId, post.draft)}>
                      {copied === copyId ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                      {copied === copyId ? "Copied" : copyFailed === copyId ? "Copy unavailable" : "Copy draft"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}
