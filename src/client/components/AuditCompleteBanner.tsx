import type { AnalysisSummary } from "../../shared/analysis-schema";
import type { CreatorScorecard } from "../../shared/creator-scorecard";

export function AuditCompleteBanner({
  analysis,
  scorecard
}: {
  analysis: AnalysisSummary;
  scorecard: CreatorScorecard;
}) {
  const winningPattern = analysis.what_is_working[0] ?? analysis.top_patterns[0] ?? "Your clearest take is your best bet.";
  const lessonWhy =
    "This is what's making your best posts work. Lean into it again this week — it's your fastest path to growth.";

  return (
    <section className="audit-complete-banner" aria-label="Patterns found">
      <div className="audit-complete-copy">
        <p className="eyebrow">Patterns found</p>
        <h2 className="audit-complete-title">{winningPattern}</h2>
        <p className="audit-complete-why">{lessonWhy}</p>
      </div>
      <div className="audit-complete-score" aria-label={`Account score ${scorecard.overallScore}`}>
        <strong>{scorecard.overallScore}</strong>
        <span>{scorecard.statusLabel}</span>
      </div>
    </section>
  );
}