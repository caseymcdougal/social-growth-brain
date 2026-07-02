export type CaptureSource = "browser" | "manual" | "x_mcp";

export interface VisibleMetrics {
  viewsCount: number | null;
  likesCount: number | null;
  repostsCount: number | null;
  repliesCount: number | null;
  bookmarksCount: number | null;
}

export interface ProfileSnapshotInput {
  handle: string;
  displayName: string;
  bio: string;
  profileUrl: string;
  followersCount: number | null;
  followingCount: number | null;
  capturedAt: string;
  source: CaptureSource;
}

export interface PostSnapshotInput extends VisibleMetrics {
  xPostId: string;
  url: string;
  text: string;
  postedAt: string | null;
  capturedAt: string;
  source: CaptureSource;
}

export interface CapturedAccountSnapshot {
  profile: ProfileSnapshotInput;
  posts: PostSnapshotInput[];
}
