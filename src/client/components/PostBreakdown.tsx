import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { AnalysisOutput } from "../../shared/analysis-schema";
import type { RankedPost } from "../../shared/performance";

function formatMetric(value: number | null) {
  return value === null ? "-" : Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

export function PostBreakdown({ rankedPosts, analysis }: { rankedPosts: RankedPost[]; analysis: AnalysisOutput | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  const postLabel = rankedPosts.length === 1 ? "post" : "posts";
  const analysisByPostId = new Map(analysis?.post_analyses.map((item) => [item.post_id, item]) ?? []);

  async function copyRewrite(postId: string, text: string) {
    await navigator.clipboard?.writeText(text);
    setCopied(postId);
    window.setTimeout(() => setCopied((current) => (current === postId ? null : current)), 1400);
  }

  return (
    <section className="panel post-breakdown" aria-labelledby="post-breakdown-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">Ranked review</p>
          <h2 id="post-breakdown-title">{rankedPosts.length ? `${rankedPosts.length} public ${postLabel}` : "No posts loaded"}</h2>
        </div>
        <span className="status-chip">{rankedPosts.length ? "Visible score" : "Empty"}</span>
      </div>
      <div className="post-list">
        {rankedPosts.length === 0 && (
          <article className="empty-post-card">
            <p>No captured public posts in the local database yet.</p>
          </article>
        )}
        {rankedPosts.map(({ post, rank, score }) => {
          const postAnalysis = analysisByPostId.get(post.xPostId);
          return (
            <article className="post-card" key={post.xPostId}>
              <div className="post-card-top">
                <span>#{rank} / score {Math.round(score)}</span>
                <div className="post-links">
                  {post.postedAt && <time dateTime={post.postedAt}>{new Date(post.postedAt).toLocaleDateString()}</time>}
                  <a href={post.url} target="_blank" rel="noreferrer" aria-label="Open post on X">
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                </div>
              </div>
              <p>{post.text}</p>
              <dl>
                <div>
                  <dt>Views</dt>
                  <dd>{formatMetric(post.viewsCount)}</dd>
                </div>
                <div>
                  <dt>Likes</dt>
                  <dd>{formatMetric(post.likesCount)}</dd>
                </div>
                <div>
                  <dt>Reposts</dt>
                  <dd>{formatMetric(post.repostsCount)}</dd>
                </div>
                <div>
                  <dt>Replies</dt>
                  <dd>{formatMetric(post.repliesCount)}</dd>
                </div>
                <div>
                  <dt>Bookmarks</dt>
                  <dd>{formatMetric(post.bookmarksCount)}</dd>
                </div>
              </dl>
              {postAnalysis && (
                <div className="post-analysis">
                  <strong>{postAnalysis.performance_read}</strong>
                  <div className="diagnosis-grid">
                    <p>
                      <span>Likely reason</span>
                      {postAnalysis.likely_reason}
                    </p>
                    <p>
                      <span>Hook</span>
                      {postAnalysis.hook_diagnosis}
                    </p>
                    <p>
                      <span>Audience</span>
                      {postAnalysis.audience_fit}
                    </p>
                    <p>
                      <span>Change</span>
                      {postAnalysis.recommended_change}
                    </p>
                  </div>
                  <blockquote>{postAnalysis.rewrite}</blockquote>
                  <div className="hook-row">
                    {postAnalysis.variant_hooks.map((hook) => (
                      <span key={hook}>{hook}</span>
                    ))}
                  </div>
                  <button className="copy-button" type="button" onClick={() => void copyRewrite(post.xPostId, postAnalysis.rewrite)}>
                    {copied === post.xPostId ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                    {copied === post.xPostId ? "Copied" : "Copy rewrite"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
