import type { CapturedAccountSnapshot } from "../../shared/types";
import type { CaptureRunner } from "./capture-runner";

export class FallbackCaptureRunner implements CaptureRunner {
  constructor(
    private readonly primary: CaptureRunner,
    private readonly secondary: CaptureRunner
  ) {}

  async captureRecentPosts(handle: string): Promise<CapturedAccountSnapshot> {
    try {
      return await this.primary.captureRecentPosts(handle);
    } catch {
      return this.secondary.captureRecentPosts(handle);
    }
  }
}
