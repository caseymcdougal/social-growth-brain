import { Lightbulb, PenLine, Target } from "lucide-react";
import type { AnalysisOutput } from "../../shared/analysis-schema";

const queue = [
  { icon: Lightbulb, label: "Hook", value: "Run an audit to generate hooks" },
  { icon: Target, label: "Why", value: "Each idea includes the rationale" },
  { icon: PenLine, label: "Draft", value: "Draft copy appears after analysis" }
];

export function NextPostQueue({ analysis }: { analysis: AnalysisOutput | null }) {
  if (!analysis) {
    return (
      <section className="panel next-posts" aria-labelledby="next-posts-title">
        <p className="eyebrow">Draft Queue</p>
        <h2 id="next-posts-title">No recommendations</h2>
        <div className="idea-list">
          {queue.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label}>
                <Icon size={17} aria-hidden="true" />
                <div>
                  <span>{item.label}</span>
                  <p>{item.value}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="panel next-posts" aria-labelledby="next-posts-title">
      <p className="eyebrow">Draft Queue</p>
      <h2 id="next-posts-title">Recommended posts</h2>
      <div className="idea-list">
        {analysis.next_post_ideas.map((idea) => (
          <article key={idea.title}>
            <Lightbulb size={17} aria-hidden="true" />
            <div>
              <span>{idea.title}</span>
              <p>{idea.hook}</p>
              <small>{idea.reason}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
