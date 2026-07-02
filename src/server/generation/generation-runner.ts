import type { AnalysisOutput } from "../../shared/analysis-schema";
import type { GenerationOutput } from "../../shared/generation-schema";
import type { StrategyMemory } from "../../shared/strategy-intelligence-schema";
import type { CapturedAccountSnapshot } from "../../shared/types";

export interface GenerationRunner {
  generateToday(input: {
    snapshot: CapturedAccountSnapshot;
    analysis: AnalysisOutput;
    strategyMemory?: StrategyMemory | null;
    direction?: string | null;
    jobDir: string;
  }): Promise<GenerationOutput>;
}
