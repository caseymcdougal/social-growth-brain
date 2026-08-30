import type { CreatorScorecard } from "../../shared/creator-scorecard";

export function ScoreStrip({ scorecard }: { scorecard: CreatorScorecard }) {
  return (
    <section className="score-strip" aria-label="Your account score">
      <div className="score-strip-score">
        <strong className="score-strip-value">{scorecard.overallScore}</strong>
        <span className="score-strip-status">{scorecard.statusLabel}</span>
      </div>
      <div className="score-strip-detail">
        <span>What to focus on</span>
        <strong>{scorecard.primaryConstraint.label}</strong>
        <p>{scorecard.primaryConstraint.nextAction}</p>
      </div>
    </section>
  );
}