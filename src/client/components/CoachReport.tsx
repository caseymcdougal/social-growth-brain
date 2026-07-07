import { Lightbulb } from "lucide-react";
import type { AnalysisSummary } from "../../shared/analysis-schema";

export function CoachReport({
  analysis,
  deferred = false,
  postCount
}: {
  analysis: AnalysisSummary | null;
  deferred?: boolean;
  postCount: number;
}) {
  if (!analysis) {
    return (
      <section className="panel coach-report" aria-labelledby="coach-report-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Your coach</p>
            <h2 id="coach-report-title">Run an audit to get your coach</h2>
          </div>
          <span className="status-chip">{postCount ? "Ready" : "No posts yet"}</span>
        </div>
        <div className="report-stack">
          <article>
            <span>Find what worked</span>
            <p>See which of your posts resonated most.</p>
          </article>
          <article>
            <span>Understand why</span>
            <p>Learn the pattern behind your best posts.</p>
          </article>
          <article>
            <span>Write your next post</span>
            <p>Draft something that fits the pattern.</p>
          </article>
        </div>
      </section>
    );
  }

  // Read the literally-named "what's working" field first so a failure statement that leaks into
  // top_patterns can never surface as a win. top_patterns is only a fallback.
  const winningPattern = analysis.what_is_working[0] ?? analysis.top_patterns[0] ?? "Repeat the clearest specific take.";
  const mainRisk = analysis.what_is_holding_back[0] ?? "Avoid abstract claims that hide the reader benefit.";
  const contentLane = analysis.recommended_content_pillars[0] ?? "Use the strongest current lane for the next post.";
  const detailCount =
    analysis.top_patterns.length +
    analysis.what_is_working.length +
    analysis.what_is_holding_back.length +
    analysis.recommended_content_pillars.length;

  const lesson = winningPattern
    ? {
        title: winningPattern,
        why: "This is what's making your best posts work. Lean into it again this week — it's your fastest path to growth."
      }
    : mainRisk
      ? {
          title: mainRisk,
          why: "This is the biggest thing holding you back. Fixing it first is your quickest win."
        }
      : {
          title: "Post consistently and watch what gets replies",
          why: "You need enough posts before patterns show up. Aim for one a day this week, then come back and audit."
        };

  const coachDetailsBody = (
    <div className="coach-details-body">
      <p className="executive-summary">{analysis.executive_summary}</p>
      <div className="pattern-strip">
        {analysis.top_patterns.map((pattern) => (
          <span key={pattern}>{pattern}</span>
        ))}
      </div>
      <div className="coach-columns">
        <div>
          <h3>What's working</h3>
          <ul>
            {analysis.what_is_working.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>What's holding you back</h3>
          <ul>
            {analysis.what_is_holding_back.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="pillar-row">
        {analysis.recommended_content_pillars.map((pillar) => (
          <span key={pillar}>{pillar}</span>
        ))}
      </div>
    </div>
  );

  const strategyBrief = (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">Your coach</p>
          <h2 id="coach-report-title">Your strategy</h2>
        </div>
        <span className="status-chip">Latest audit</span>
      </div>

      <article className="coach-lesson" aria-label="This week's lesson">
        <div className="coach-lesson-head">
          <Lightbulb size={14} aria-hidden="true" />
          <span>This week's lesson</span>
        </div>
        <p className="coach-lesson-title">{lesson.title}</p>
        <p className="coach-lesson-why">{lesson.why}</p>
      </article>

      <p className="positioning-read">{analysis.account_positioning_read}</p>

      <div className="coach-brief-grid" aria-label="Strategy highlights">
        <article>
          <span>What's working</span>
          <strong>{winningPattern}</strong>
          <p>Why this matters: repeat what's working before trying something brand new — it's your fastest growth.</p>
        </article>
        <article data-kind="risk">
          <span>What to fix</span>
          <strong>{mainRisk}</strong>
          <p>Why this matters: this is the thing most likely to hold back your next post. Fix it first.</p>
        </article>
        <article>
          <span>Your content lane</span>
          <strong>{contentLane}</strong>
          <p>Why this matters: stay in this lane for a few posts so your audience knows what to expect from you.</p>
        </article>
      </div>

      {deferred ? (
        coachDetailsBody
      ) : (
        <details className="disclosure coach-details" aria-label="Full coach read">
          <summary>
            <span>See the full breakdown</span>
            <strong>{detailCount} notes</strong>
            <small>Open for the full summary, every pattern, and content ideas.</small>
          </summary>
          {coachDetailsBody}
        </details>
      )}
    </>
  );

  if (deferred) {
    return (
      <details className="panel disclosure disclosure-panel coach-report coach-context-disclosure" aria-label="Why these suggestions">
        <summary>
          <span>Why these suggestions</span>
          <strong>Latest audit</strong>
          <small>Open for the lesson, what's working, what to fix, and your content lane.</small>
        </summary>
        <div className="coach-context-body">{strategyBrief}</div>
      </details>
    );
  }

  return (
    <section className="panel coach-report" aria-labelledby="coach-report-title">
      {strategyBrief}
    </section>
  );
}
