import type { AnalysisOutput } from "../../shared/analysis-schema";
import type {
  StrategyMemory,
  StrategyMemoryProposalOutput,
  TopicExplorationOutput
} from "../../shared/strategy-intelligence-schema";
import type { CapturedAccountSnapshot } from "../../shared/types";

export interface StrategyIntelligenceRunner {
  generateMemoryProposal(input: {
    snapshot: CapturedAccountSnapshot;
    analysis: AnalysisOutput;
    currentMemory: StrategyMemory | null;
    direction?: string | null;
    jobDir: string;
  }): Promise<StrategyMemoryProposalOutput>;

  exploreTopics(input: {
    snapshot: CapturedAccountSnapshot;
    analysis: AnalysisOutput;
    currentMemory: StrategyMemory | null;
    direction?: string | null;
    jobDir: string;
  }): Promise<TopicExplorationOutput>;
}
