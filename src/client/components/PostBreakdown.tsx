import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { AnalysisOutput } from "../../shared/analysis-schema";
import type { RankedPost } from "../../shared/performance";

function formatMetric(value: number | null) {
  return value === null ? "-" : Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

const DEFAULT_VISIBLE_POST_COUNT = 3;

export function PostBreakdown({
  rankedPosts,
  analysis,
  deferred = false,
  preview = false,
  selectedPostId = null,
  onSelectPost
}: {
  rankedPosts: RankedPost[];
  analysis: AnalysisOutput | null;
  deferred?: boolean;
  preview?: boolean;
  selectedPostId?: string | null;
  onSelectPost?: (postId: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  const analysisByPostId = new Map(analysis?.post_analyses.map((item) => [item.post_id, item]) ?? []);
  const visibleCount = preview ? DEFAULT_VISIBLE_POST_COUNT : DEFAULT_VISIBLE_POST_COUNT;
  const topRankedPosts = rankedPosts.slice(0, visibleCount);
  const selectedLongTailPost = selectedPostId
    ? rankedPosts.find(
        (rankedPost) =>
          rankedPost.post.xPostId === selectedPostId &&
          !topRankedPosts.some((topPost) => topPost.post.xPostId === rankedPost.post.xPostId)
      )
    : null;
  const visibleRankedPosts = selectedLongTailPost ? [...topRankedPosts, selectedLongTailPost] : topRankedPosts;
  const visiblePostIds = new Set(visibleRankedPosts.map((rankedPost) => rankedPost.post.xPostId));
  const longTailPosts = rankedPosts.filter((rankedPost) => !visiblePostIds.has(rankedPost.post.xPostId));

  async function copyRewrite(postId: string, text: string) {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopyFailed(null);
      setCopied(postId);
      window.setTimeout(() => setCopied((current) => (current === postId ? null : current)), 1400);
    } catch {
      setCopied(null);
      setCopyFailed(postId);
      window.setTimeout(() => setCopyFailed((current) => (current === postId ? null : current)), 1800);
    }
  }

  function renderPostCard({ post, rank, score }: RankedPost) {
    const postAnalysis = analysisByPostId.get(post.xPostId);
    const selected = selectedPostId === post.xPostId;
    return (
      <article className="post-card" data-selected={selected ? "true" : undefined} key={post.xPostId}>
        <div className="post-card-top">
          <span>#{rank} / score {Math.round(score)}</span>
          <div className="post-links">
            {post.postedAt && <time dateTime={post.postedAt}>{new Date(post.postedAt).toLocaleDateString()}</time>}
            {onSelectPost && (
              <button
                aria-pressed={selected}
                className="post-select-button"
                type="button"
                onClick={() => onSelectPost(post.xPostId)}
              >
                {selected ? "Selected" : "Work this post"}
              </button>
            )}
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
            <details className="disclosure disclosure-compact post-analysis-details" aria-label={`Post analysis details for post #${rank}`}>
              <summary>
                <span>Analysis details</span>
                <strong>Rewrite and diagnosis</strong>
                <small>Open for likely reason, hook read, audience fit, variants, and copy action.</small>
              </summary>
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
                {copied === post.xPostId ? "Copied" : copyFailed === post.xPostId ? "Copy unavailable" : "Copy rewrite"}
              </button>
            </details>
          </div>
        )}
      </article>
    );
  }

  const postBreakdownContent = (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">{preview ? "See your posts" : "Find what worked"}</p>
          <h2 id="post-breakdown-title">{rankedPosts.length ? (preview ? "Your recent posts" : "What resonated most") : "No posts loaded"}</h2>
          {rankedPosts.length > 0 && (
            <p className="post-breakdown-lead">
              Showing the strongest decision posts first. Open the full review for the rest of the captured sample.
            </p>
          )}
        </div>
        <span className="status-chip">{rankedPosts.length ? `${rankedPosts.length} ranked` : "Empty"}</span>
      </div>
      <div className="post-list">
        {rankedPosts.length === 0 && (
          <article className="empty-post-card">
            <p>No captured public posts in the local database yet.</p>
          </article>
        )}
        {visibleRankedPosts.map((rankedPost) => renderPostCard(rankedPost))}
      </div>
      {longTailPosts.length > 0 && (
        <details className="disclosure full-review-library" aria-label="Full ranked review">
          <summary>
            <span>Full ranked review</span>
            <strong>
              {longTailPosts.length} more {longTailPosts.length === 1 ? "post" : "posts"}
            </strong>
            <small>Open when you need the rest of the captured sample.</small>
          </summary>
          <div className="post-list">{longTailPosts.map((rankedPost) => renderPostCard(rankedPost))}</div>
        </details>
      )}
    </>
  );

  if (preview) {
    return (
      <section className="panel post-breakdown post-breakdown-preview" aria-labelledby="post-breakdown-title">
        {postBreakdownContent}
      </section>
    );
  }

  if (deferred && rankedPosts.length > 0) {
    const rankedPostLabel = rankedPosts.length === 1 ? "ranked post" : "ranked posts";
    return (
      <details className="panel disclosure disclosure-panel post-breakdown source-evidence-disclosure" aria-label="Your posts ranked">
        <summary>
          <span>Your posts ranked</span>
          <strong>
            {rankedPosts.length} {rankedPostLabel}
          </strong>
          <small>Open to trace the draft back to source posts or choose another post to work.</small>
        </summary>
        <div className="source-evidence-body">{postBreakdownContent}</div>
      </details>
    );
  }

  return (
    <section className="panel post-breakdown" aria-labelledby="post-breakdown-title">
      {postBreakdownContent}
    </section>
  );
}
