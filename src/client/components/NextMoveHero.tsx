import { PenLine, RefreshCcw, Upload, Wand2 } from "lucide-react";
import type { AnalysisSummary } from "../../shared/analysis-schema";
import type { GenerationOutput } from "../../shared/generation-schema";
import type { MetricCompletenessSummary } from "../../shared/performance";
import type { CreatorScorecard } from "../../shared/creator-scorecard";
import type { CapturedAccountSnapshot } from "../../shared/types";
import { cta, emptyStatePreview, heroPhaseSteps } from "../../shared/ux-copy";
import { formatPostingWindow } from "../postingWindow";

function getHeroPhaseIndex(phase: "empty" | "scanned" | "audited") {
  if (phase === "audited") return 3;
  if (phase === "scanned") return 1;
  return 0;
}

export function NextMoveHero(props: {
  snapshot: CapturedAccountSnapshot | null;
  metricSummary: MetricCompletenessSummary;
  scorecard: CreatorScorecard | null;
  loading: boolean;
  capturing: boolean;
  analyzing: boolean;
  generating: boolean;
  hasAnalysis: boolean;
  analysis: AnalysisSummary | null;
  generation: GenerationOutput | null;
  error: string | null;
  status: string | null;
  onAnalyze: () => void;
  onCapture: () => void;
  onGenerateToday: () => void;
  onOpenImport: () => void;
}) {
  const capturedAt = props.snapshot?.profile.capturedAt
    ? new Date(props.snapshot.profile.capturedAt).toLocaleString()
    : "No capture yet";
  const handle = props.snapshot ? `@${props.snapshot.profile.handle}` : "No local snapshot";
  const postCount = props.snapshot?.posts.length ?? 0;
  const postLabel = postCount === 1 ? "post" : "posts";
  const coverage = Math.round(props.metricSummary.completenessRatio * 100);
  const isBusy = props.loading || props.capturing || props.analyzing || props.generating;
  const postingWindow = formatPostingWindow();
  const phase = props.generation ? "drafted" : props.hasAnalysis ? "audited" : props.snapshot ? "scanned" : "empty";

  if (phase === "drafted") return null;

  const headline =
    phase === "audited"
      ? "Write your next post"
      : phase === "scanned"
        ? "Find what's working"
        : "Let's look at your posts";
  const guidance =
    phase === "audited"
      ? "Your patterns are ready. Turn what's working into a few draft posts you can copy into X."
      : phase === "scanned"
        ? "Your posts are loaded. Next we'll find the patterns behind your best ones."
        : "Pull your public X posts in here so we can see how they're doing.";
  const preview = phase === "scanned" ? "Next you'll get one lesson on what's working and why." : null;
  const phaseLabel =
    phase === "audited" ? "Write" : phase === "scanned" ? "Find" : heroPhaseSteps[0];
  const phaseIndex = getHeroPhaseIndex(phase);

  return (
    <section className="capture-bar next-move-hero" aria-label="Next move" data-phase={phase}>
      <div className="capture-summary">
        <div className="hero-phase-track" aria-hidden="true">
          {heroPhaseSteps.map((label, index) => (
            <span
              className="hero-phase-step"
              data-active={index <= phaseIndex ? "true" : "false"}
              data-current={index === phaseIndex ? "true" : "false"}
              key={label}
            >
              {label}
            </span>
          ))}
        </div>
        <p className="eyebrow">Next move / {phaseLabel}</p>
        <h2 id="next-move-title">{headline}</h2>
        <p>{guidance}</p>
        {preview && <p className="phase-preview">{preview}</p>}
        {phase === "empty" && (
          <ul className="empty-state-preview" aria-label="What you'll get">
            {emptyStatePreview.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        {phase === "audited" && props.scorecard && (
          <p className="phase-scoreline">
            {props.scorecard.statusLabel} · {props.scorecard.overallScore}/100
          </p>
        )}
        {props.snapshot && (
          <div className="capture-facts" aria-label="Capture facts">
            <span>{handle}</span>
            <span>{capturedAt}</span>
            <span>
              {postCount} {postLabel}
            </span>
            <span>{coverage}% data read</span>
            {props.hasAnalysis && <span>Post window {postingWindow}</span>}
          </div>
        )}
        {props.status && <p className="inline-status">{props.status}</p>}
        {props.analyzing && <p className="inline-status">Reading patterns… usually 30–90 seconds.</p>}
        {props.error && (
          <p className="inline-error" role="alert">
            {props.error}
          </p>
        )}
      </div>
      <div className="capture-actions">
        {phase === "empty" ? (
          <>
            <button
              className="primary-button"
              type="button"
              onClick={props.onCapture}
              disabled={isBusy}
              aria-busy={props.capturing || undefined}
            >
              <RefreshCcw size={16} aria-hidden="true" /> {props.capturing ? cta.scanning : cta.scanPosts}
            </button>
            <button className="inline-text-action" type="button" onClick={props.onOpenImport} disabled={isBusy}>
              <Upload size={14} aria-hidden="true" /> {cta.pasteSnapshot}
            </button>
          </>
        ) : phase === "audited" ? (
          <>
            <button
              className="primary-button"
              type="button"
              disabled={isBusy}
              onClick={props.onGenerateToday}
              aria-busy={props.generating || undefined}
            >
              <PenLine size={16} aria-hidden="true" /> {props.generating ? cta.writing : cta.writeDrafts}
            </button>
            <details className="capture-maintenance" aria-label="More options">
              <summary>
                <span>More options</span>
                <small>Re-scan, paste</small>
              </summary>
              <div className="capture-maintenance-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isBusy}
                  onClick={props.onAnalyze}
                  aria-busy={props.analyzing || undefined}
                >
                  <Wand2 size={16} aria-hidden="true" /> {props.analyzing ? cta.analyzing : cta.runAuditAgain}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={props.onCapture}
                  disabled={isBusy}
                  aria-busy={props.capturing || undefined}
                >
                  <RefreshCcw size={16} aria-hidden="true" /> {props.capturing ? cta.scanning : cta.scanAgain}
                </button>
                <button className="secondary-button" type="button" onClick={props.onOpenImport} disabled={isBusy}>
                  <Upload size={16} aria-hidden="true" /> Paste snapshot
                </button>
              </div>
            </details>
          </>
        ) : (
          <>
            <button
              className="primary-button"
              type="button"
              disabled={isBusy}
              onClick={props.onAnalyze}
              aria-busy={props.analyzing || undefined}
            >
              <Wand2 size={16} aria-hidden="true" /> {props.analyzing ? cta.analyzing : cta.findPatterns}
            </button>
            <details className="capture-maintenance" aria-label="More options">
              <summary>
                <span>More options</span>
                <small>Scan again, paste</small>
              </summary>
              <div className="capture-maintenance-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={props.onCapture}
                  disabled={isBusy}
                  aria-busy={props.capturing || undefined}
                >
                  <RefreshCcw size={16} aria-hidden="true" /> {props.capturing ? cta.scanning : cta.scanAgain}
                </button>
                <button className="secondary-button" type="button" onClick={props.onOpenImport} disabled={isBusy}>
                  <Upload size={16} aria-hidden="true" /> Paste snapshot
                </button>
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}