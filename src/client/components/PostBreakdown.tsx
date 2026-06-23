import type { CapturedAccountSnapshot, PostSnapshotInput } from "../../shared/types";

function formatMetric(value: number | null) {
  return value === null ? "-" : Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function engagementScore(post: PostSnapshotInput) {
  return [post.likesCount, post.repostsCount, post.repliesCount, post.bookmarksCount].reduce<number>(
    (total, value) => total + (value ?? 0),
    0
  );
}

export function PostBreakdown({ snapshot }: { snapshot: CapturedAccountSnapshot | null }) {
  const posts = snapshot?.posts ?? [];
  const postLabel = posts.length === 1 ? "post" : "posts";

  return (
    <section className="panel post-breakdown" aria-labelledby="post-breakdown-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">Post Breakdown</p>
          <h2 id="post-breakdown-title">{posts.length ? `${posts.length} recent ${postLabel}` : "No posts loaded"}</h2>
        </div>
        <span className="status-chip">{posts.length ? "Captured" : "Empty"}</span>
      </div>
      <div className="post-list">
        {posts.length === 0 && (
          <article className="empty-post-card">
            <p>Import a snapshot to populate the 25-post review lane.</p>
          </article>
        )}
        {posts.map((post) => (
          <article className="post-card" key={post.xPostId}>
            <div className="post-card-top">
              <span>Score {engagementScore(post)}</span>
              {post.postedAt && <time dateTime={post.postedAt}>{new Date(post.postedAt).toLocaleDateString()}</time>}
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
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
