export function CoachReport() {
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
