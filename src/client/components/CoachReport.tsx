import type { AnalysisOutput } from "../../shared/analysis-schema";

export function CoachReport({ analysis, postCount }: { analysis: AnalysisOutput | null; postCount: number }) {
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
            <p>Generate stronger next posts from the read.</p>
          </article>
        </div>
      </section>
    );
  }

  return (
    <section className="panel coach-report" aria-labelledby="coach-report-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">Coach read</p>
          <h2 id="coach-report-title">Positioning read</h2>
        </div>
        <span className="status-chip">Latest audit</span>
      </div>
      <p className="positioning-read">{analysis.account_positioning_read}</p>
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
    </section>
  );
}
