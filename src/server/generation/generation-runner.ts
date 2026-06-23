import type { AnalysisOutput } from "../../shared/analysis-schema";
import type { GenerationOutput } from "../../shared/generation-schema";
import type { CapturedAccountSnapshot } from "../../shared/types";

export interface GenerationRunner {
  generateToday(input: { snapshot: CapturedAccountSnapshot; analysis: AnalysisOutput; jobDir: string }): Promise<GenerationOutput>;
}
