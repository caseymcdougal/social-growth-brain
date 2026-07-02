import { ListChecks, RefreshCcw, Sparkles, Upload, Wand2 } from "lucide-react";
import type { AnalysisSummary } from "../../shared/analysis-schema";
import type { GenerationOutput } from "../../shared/generation-schema";
import type { MetricCompletenessSummary } from "../../shared/performance";
import type { CapturedAccountSnapshot } from "../../shared/types";
import { formatPostingWindow } from "../postingWindow";

export function CaptureBar(props: {
  snapshot: CapturedAccountSnapshot | null;
  metricSummary: MetricCompletenessSummary;
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
  const draftCount = props.generation?.posts.length ?? 0;
  const draftLabel = draftCount === 1 ? "draft" : "drafts";
  const phase = props.generation ? "Choose" : props.hasAnalysis ? "Draft" : props.snapshot ? "Analyze" : "Scan";
  const headline = props.generation
    ? "Pick your favorite draft"
    : props.hasAnalysis
      ? "Write your next post"
      : props.snapshot
        ? "Find what's working"
        : "Let's look at your posts";
  const guidance = props.generation
    ? "Your drafts are ready. Pick the one that feels most like you, then copy it into X."
    : props.hasAnalysis
      ? "Your audit is ready. Let's turn what's working into a few draft posts."
      : props.snapshot
        ? "Your posts are loaded. Next we'll find the patterns behind your best ones."
        : "Pull your public X posts into here so we can see how they're doing.";

  function handleReviewDraftQueue() {
    const target = document.getElementById("next-posts-title") ?? document.querySelector(".next-posts");
    if (target && "scrollIntoView" in target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  const generatedActions = (
    <>
      <button className="primary-button" type="button" disabled={isBusy} onClick={handleReviewDraftQueue}>
        <ListChecks size={16} aria-hidden="true" /> See my drafts
      </button>
      <button
        className="secondary-button"
        type="button"
        disabled={isBusy}
        onClick={props.onGenerateToday}
        aria-busy={props.generating || undefined}
      >
        <Sparkles size={16} aria-hidden="true" /> {props.generating ? "Writing…" : "Write new ideas"}
      </button>
      <details className="capture-maintenance" aria-label="More options">
        <summary>
          <span>More options</span>
          <small>Audit, scan, paste</small>
        </summary>
        <div className="capture-maintenance-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={isBusy}
            onClick={props.onAnalyze}
            aria-busy={props.analyzing || undefined}
          >
            <Wand2 size={16} aria-hidden="true" /> {props.analyzing ? "Analyzing…" : "Run audit again"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={props.onCapture}
            disabled={isBusy}
            aria-busy={props.capturing || undefined}
          >
            <RefreshCcw size={16} aria-hidden="true" /> {props.capturing ? "Scanning…" : "Scan again"}
          </button>
          <button className="secondary-button" type="button" onClick={props.onOpenImport} disabled={isBusy}>
            <Upload size={16} aria-hidden="true" /> Paste snapshot
          </button>
        </div>
      </details>
    </>
  );

  if (props.generation) {
    return (
      <section className="capture-bar capture-bar-compact" aria-label="Capture status">
        <div className="capture-summary">
          <p className="eyebrow">Next move</p>
          <h2>Your drafts are ready</h2>
          <p>
            {draftCount} {draftLabel} ready from your latest audit.
          </p>
          {props.status && <p className="inline-status">{props.status}</p>}
          {props.error && (
            <p className="inline-error" role="alert">
              {props.error}
            </p>
          )}
        </div>
        <div className="capture-actions">{generatedActions}</div>
      </section>
    );
  }

  return (
    <section className="capture-bar" aria-label="Capture status">
      <div className="capture-summary">
        <p className="eyebrow">Next move / {phase}</p>
        <h2>{headline}</h2>
        <p>{guidance}</p>
        <div className="capture-facts" aria-label="Capture facts">
          <span>{handle}</span>
          <span>{capturedAt}</span>
          <span>
            {postCount} {postLabel}
          </span>
          <span>{coverage}% of metrics captured</span>
          {props.hasAnalysis && <span>Post window {postingWindow}</span>}
        </div>
        {props.status && <p className="inline-status">{props.status}</p>}
        {props.error && (
          <p className="inline-error" role="alert">
            {props.error}
          </p>
        )}
      </div>
      <div className="capture-actions">
        {!props.snapshot ? (
          <>
            <button
              className="primary-button"
              type="button"
              onClick={props.onCapture}
              disabled={isBusy}
              aria-busy={props.capturing || undefined}
            >
              <RefreshCcw size={16} aria-hidden="true" /> {props.capturing ? "Scanning…" : "Scan my posts"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={props.onOpenImport}
              disabled={isBusy}
            >
              <Upload size={16} aria-hidden="true" /> Paste snapshot
            </button>
          </>
        ) : props.hasAnalysis ? (
          <>
            <button
              className="primary-button"
              type="button"
              disabled={isBusy}
              onClick={props.onGenerateToday}
              aria-busy={props.generating || undefined}
            >
              <Sparkles size={16} aria-hidden="true" /> {props.generating ? "Writing…" : "Write draft ideas"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isBusy}
              onClick={props.onAnalyze}
              aria-busy={props.analyzing || undefined}
            >
              <Wand2 size={16} aria-hidden="true" /> {props.analyzing ? "Analyzing…" : "Run audit again"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={props.onCapture}
              disabled={isBusy}
              aria-busy={props.capturing || undefined}
            >
              <RefreshCcw size={16} aria-hidden="true" /> {props.capturing ? "Scanning…" : "Scan again"}
            </button>
            <button className="secondary-button" type="button" onClick={props.onOpenImport} disabled={isBusy}>
              <Upload size={16} aria-hidden="true" /> Paste snapshot
            </button>
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
              <Wand2 size={16} aria-hidden="true" /> {props.analyzing ? "Analyzing…" : "Find what's working"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={props.onCapture}
              disabled={isBusy}
              aria-busy={props.capturing || undefined}
            >
              <RefreshCcw size={16} aria-hidden="true" /> {props.capturing ? "Scanning…" : "Scan again"}
            </button>
            <button className="secondary-button" type="button" onClick={props.onOpenImport} disabled={isBusy}>
              <Upload size={16} aria-hidden="true" /> Paste snapshot
            </button>
          </>
        )}
      </div>
    </section>
  );
}
