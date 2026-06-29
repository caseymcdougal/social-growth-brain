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
            <p className="eyebrow">Coach read</p>
            <h2 id="coach-report-title">Awaiting strategy audit</h2>
          </div>
          <span className="status-chip">{postCount ? "Ready" : "No scan"}</span>
        </div>
        <div className="report-stack">
          <article>
            <span>Rank</span>
            <p>Sort the public posts by visible signal.</p>
          </article>
          <article>
            <span>Diagnose</span>
            <p>Explain the hook, clarity, and audience fit.</p>
          </article>
          <article>
            <span>Write</span>
            <p>Draft the next move from the read.</p>
          </article>
        </div>
      </section>
    );
  }

  const winningPattern = analysis.top_patterns[0] ?? analysis.what_is_working[0] ?? "Repeat the clearest specific take.";
  const mainRisk = analysis.what_is_holding_back[0] ?? "Avoid abstract claims that hide the reader benefit.";
  const contentLane = analysis.recommended_content_pillars[0] ?? "Use the strongest current lane for the next post.";
  const detailCount =
    analysis.top_patterns.length +
    analysis.what_is_working.length +
    analysis.what_is_holding_back.length +
    analysis.recommended_content_pillars.length;

  const strategyBrief = (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">Coach read</p>
          <h2 id="coach-report-title">Strategy brief</h2>
        </div>
        <span className="status-chip">Latest audit</span>
      </div>
      <p className="positioning-read">{analysis.account_positioning_read}</p>

      <div className="coach-brief-grid" aria-label="Strategy brief highlights">
        <article>
          <span>Winning pattern</span>
          <strong>{winningPattern}</strong>
          <p>Repeat this signal before changing the whole content lane.</p>
        </article>
        <article data-kind="risk">
          <span>Main risk</span>
          <strong>{mainRisk}</strong>
          <p>Fix this before drafting so the next post has a sharper reader stake.</p>
        </article>
        <article>
          <span>Content lane</span>
          <strong>{contentLane}</strong>
          <p>Use this as the default lane for the next draft set.</p>
        </article>
      </div>

      <details className="coach-details" aria-label="Full coach read">
        <summary>
          <span>Full coach read</span>
          <strong>{detailCount} audit notes</strong>
          <small>Open for the full summary, all patterns, constraints, and content pillars.</small>
        </summary>

        <div className="coach-details-body">
          <p className="executive-summary">{analysis.executive_summary}</p>
          <div className="pattern-strip">
            {analysis.top_patterns.map((pattern) => (
              <span key={pattern}>{pattern}</span>
            ))}
          </div>
          <div className="coach-columns">
            <div>
              <h3>Working</h3>
              <ul>
                {analysis.what_is_working.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Holding Back</h3>
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
      </details>
    </>
  );

  if (deferred) {
    return (
      <details className="panel coach-report coach-context-disclosure" aria-label="Strategy context">
        <summary>
          <span>Strategy context</span>
          <strong>Latest audit read</strong>
          <small>Open for winning pattern, main risk, content lane, and the full coach read.</small>
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
