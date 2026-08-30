import type { AnalysisSummary } from "../../shared/analysis-schema";
import { formatPostingWindow } from "../postingWindow";

export function PreDraftBrief({ analysis }: { analysis: AnalysisSummary }) {
  const featuredIdea = analysis.next_post_ideas[0] ?? null;
  const postingWindow = formatPostingWindow();

  return (
    <section className="panel pre-draft-brief" aria-labelledby="pre-draft-brief-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">Write your next post</p>
          <h2 id="pre-draft-brief-title">Your angle for today</h2>
        </div>
        <span className="status-chip">Ready to draft</span>
      </div>

      {featuredIdea ? (
        <div className="pre-draft-brief-body">
          <article className="pre-draft-featured">
            <span>Lead with</span>
            <strong>{featuredIdea.title}</strong>
            <p className="pre-draft-hook">{featuredIdea.hook}</p>
            <small>{featuredIdea.reason}</small>
          </article>
          <div className="posting-brief-grid">
            <article className="posting-brief-wide posting-window-card">
              <span>Post window</span>
              <strong>{postingWindow}</strong>
              <small>Heuristic timing cue. Confirm it against the next scan.</small>
            </article>
          </div>
        </div>
      ) : (
        <p>Your pattern read is ready — generate a few drafts to pick from.</p>
      )}

    </section>
  );
}