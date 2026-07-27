import { Check, Copy, ListChecks, PenLine, RefreshCcw, Upload, Wand2 } from "lucide-react";
import { useState } from "react";
import { formatCreatorScorecardForClipboard, type CreatorScorecard } from "../../shared/creator-scorecard";
import type { OpportunityBrief } from "../../shared/opportunities";
import { cta, scorecardDimensionHints } from "../../shared/ux-copy";
import type { ActionProgressItem } from "./ActionProgressPanel";

export function AuditCommandCenter({
  activeAction,
  analyzing,
  capturing,
  coveragePercent,
  draftCount,
  generating,
  isGenerated,
  isBusy,
  onAnalyze,
  onCapture,
  onGenerateToday,
  onOpenImport,
  onReviewDraftQueue,
  opportunityBrief,
  postCount,
  scorecard
}: {
  activeAction: ActionProgressItem | null;
  analyzing: boolean;
  capturing: boolean;
  coveragePercent: number;
  draftCount: number;
  generating: boolean;
  isGenerated: boolean;
  isBusy: boolean;
  onAnalyze: () => void;
  onCapture: () => void;
  onGenerateToday: () => void;
  onOpenImport: () => void;
  onReviewDraftQueue: () => void;
  opportunityBrief: OpportunityBrief;
  postCount: number;
  scorecard: CreatorScorecard;
}) {
  const [scorecardCopied, setScorecardCopied] = useState(false);
  const [scorecardCopyFailed, setScorecardCopyFailed] = useState(false);
  const bestOpportunity = opportunityBrief.priorityCards[0] ?? null;
  const sourcePostLabel = `${postCount} ${postCount === 1 ? "post" : "posts"}`;
  const draftLabel = `${draftCount} ${draftCount === 1 ? "draft" : "drafts"}`;
  const stagedDraftLabel = `${draftLabel} staged`;
  const readinessLabel = activeAction
    ? activeAction.label
    : isGenerated
      ? `${draftLabel} · ${coveragePercent}% of metrics captured`
      : `${sourcePostLabel} · ${coveragePercent}% of metrics captured`;
  const commandSignals = [
    {
      label: "Your account health",
      title: `${scorecard.statusLabel} · ${scorecard.overallScore}`,
      detail: `${sourcePostLabel} · ${coveragePercent}% of metrics captured`
    },
    {
      label: "What to fix",
      title: scorecard.primaryConstraint.label,
      detail: scorecard.primaryConstraint.nextAction
    },
    {
      label: "Your best next post",
      title: bestOpportunity?.title ?? "Add your first posts",
      detail: bestOpportunity?.detail ?? "Scan your account so the dashboard can show you what to post next."
    }
  ];

  async function copyScorecardBrief() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(formatCreatorScorecardForClipboard(scorecard));
      setScorecardCopyFailed(false);
      setScorecardCopied(true);
      window.setTimeout(() => setScorecardCopied(false), 1400);
    } catch {
      setScorecardCopied(false);
      setScorecardCopyFailed(true);
      window.setTimeout(() => setScorecardCopyFailed(false), 1800);
    }
  }

  return (
    <section
      className={isGenerated ? "panel command-center-panel is-generated" : "panel command-center-panel"}
      data-mode={isGenerated ? "draft" : "audit"}
      aria-labelledby="command-center-title"
    >
      <div className="command-center-lead">
        <div>
          <p className="eyebrow">{isGenerated ? "Ready to write" : "How your account is doing"}</p>
          <h2 id="command-center-title">{isGenerated ? "Your next post, ready to go" : "Your account at a glance"}</h2>
          <p>{scorecard.summary}</p>
        </div>
        <span className="status-chip">{readinessLabel}</span>
      </div>

      {isGenerated ? (
        <div className="command-center-handoff" aria-label="Draft handoff priorities">
          <article className="command-center-primary-action">
            <span>Your drafts</span>
            <strong>{stagedDraftLabel}</strong>
            <p>Pick one, copy it into X, or write fresh ideas.</p>
          </article>
          <div className="command-center-actions">
            <button className="primary-button" type="button" disabled={isBusy} onClick={onReviewDraftQueue}>
              <ListChecks size={16} aria-hidden="true" /> {cta.seeDrafts}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isBusy}
              onClick={onGenerateToday}
              aria-busy={generating || undefined}
            >
              <PenLine size={16} aria-hidden="true" /> {generating ? cta.writing : cta.writeNewIdeas}
            </button>
            <details className="capture-maintenance command-center-maintenance" aria-label="More options">
              <summary>
                <span>More options</span>
              </summary>
              <div className="capture-maintenance-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isBusy}
                  onClick={onAnalyze}
                  aria-busy={analyzing || undefined}
                >
                  <Wand2 size={16} aria-hidden="true" /> {analyzing ? cta.analyzing : cta.runAuditAgain}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={onCapture}
                  disabled={isBusy}
                  aria-busy={capturing || undefined}
                >
                  <RefreshCcw size={16} aria-hidden="true" /> {capturing ? cta.scanning : cta.scanAgain}
                </button>
                <button className="secondary-button" type="button" onClick={onOpenImport} disabled={isBusy}>
                  <Upload size={16} aria-hidden="true" /> Paste snapshot
                </button>
              </div>
            </details>
          </div>
          <div className="command-center-signals" aria-label="Command signals">
            {commandSignals.map((signal) => (
              <article className="command-center-signal" key={signal.label}>
                <span>{signal.label}</span>
                <strong>{signal.title}</strong>
                <p>{signal.detail}</p>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="command-center-grid">
          <article className="command-center-card is-primary">
            <span>Your account health</span>
            <div className="score-hero">
              <strong className="score-value">{scorecard.overallScore}</strong>
              <span className="score-status">{scorecard.statusLabel}</span>
            </div>
            <p>{scorecard.primaryConstraint.detail}</p>
          </article>
          <article className="command-center-card">
            <span>Your next move</span>
            <strong>{opportunityBrief.command.title}</strong>
            <p>{opportunityBrief.command.detail}</p>
          </article>
          <article className="command-center-card">
            <span>What to fix</span>
            <strong>{scorecard.primaryConstraint.label}</strong>
            <p>{scorecard.primaryConstraint.nextAction}</p>
          </article>
          <article className="command-center-card">
            <span>Your best next post</span>
            <strong>{bestOpportunity?.title ?? "Add your first posts"}</strong>
            <p>{bestOpportunity?.detail ?? "Scan your account so the dashboard can show you what to post next."}</p>
          </article>
        </div>
      )}

      <section className="scorecard-breakdown-inline command-score-breakdown" aria-label="Score breakdown">
        <div className="scorecard-inline-head">
          <span>What makes up your score</span>
          <strong>{scorecard.dimensions.length} things we measure</strong>
        </div>

        <div className="scorecard-breakdown-body">
          <div className="scorecard-dimensions" aria-label="Creator scorecard dimensions">
            {scorecard.dimensions.map((dimension) => (
              <article data-key={dimension.key} key={dimension.key}>
                <div className="scorecard-dimension-top">
                  <span>{dimension.label}</span>
                  <strong>{dimension.score}</strong>
                </div>
                <div className="scorecard-meter" aria-hidden="true">
                  <span style={{ width: `${dimension.score}%` }} />
                </div>
                <p>{dimension.statusLabel}</p>
                <small>{dimension.detail}</small>
                <small className="scorecard-dimension-hint">{scorecardDimensionHints[dimension.key]}</small>
              </article>
            ))}
          </div>
          <button className="copy-button scorecard-copy" type="button" onClick={() => void copyScorecardBrief()}>
            {scorecardCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {scorecardCopied ? "Copied" : scorecardCopyFailed ? "Copy unavailable" : "Copy my summary"}
          </button>
        </div>
      </section>
    </section>
  );
}