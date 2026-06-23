import type { CapturedAccountSnapshot } from "../../shared/types";

export interface CaptureRunner {
  captureRecentPosts(handle: string): Promise<CapturedAccountSnapshot>;
}

export class CaptureError extends Error {
  constructor(
    public stage: "browser_not_reachable" | "x_not_logged_in" | "profile_not_found" | "parser_failed" | "not_enough_posts",
    message: string
  ) {
    super(message);
  }
}
