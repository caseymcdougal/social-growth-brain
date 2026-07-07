import type { AnalysisOutput } from "../../shared/analysis-schema";
import type { CapturedAccountSnapshot } from "../../shared/types";

export interface AiRunner {
  analyze(snapshot: CapturedAccountSnapshot, jobDir: string, voiceBlock?: string): Promise<AnalysisOutput>;
}
