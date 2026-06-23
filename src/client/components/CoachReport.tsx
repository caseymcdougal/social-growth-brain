import type { AnalysisOutput } from "../../shared/analysis-schema";

export function CoachReport({ analysis }: { analysis: AnalysisOutput | null }) {
  if (!analysis) {
    return (
      <section className="panel coach-report" aria-labelledby="coach-report-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Coach Report</p>
            <h2 id="coach-report-title">Ready for analysis</h2>
          </div>
          <span className="status-chip">Waiting</span>
        </div>
        <div className="report-stack">
          <article>
            <span>01</span>
            <p>Performance patterns</p>
          </article>
          <article>
            <span>02</span>
            <p>Hook and clarity diagnosis</p>
          </article>
          <article>
            <span>03</span>
            <p>Rewrite and next angle</p>
          </article>
        </div>
      </section>
    );
  }

  return (
    <section className="panel coach-report" aria-labelledby="coach-report-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">Coach Report</p>
          <h2 id="coach-report-title">{analysis.account_positioning_read}</h2>
        </div>
        <span className="status-chip">Analyzed</span>
      </div>
      <p className="executive-summary">{analysis.executive_summary}</p>
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
