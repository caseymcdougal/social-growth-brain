import type { AnalysisOutput } from "../../shared/analysis-schema";
import type { ScanHistoryBrief } from "../../shared/scan-history";
import type { StrategyMemory } from "../../shared/strategy-intelligence-schema";
import type { CapturedAccountSnapshot } from "../../shared/types";

export interface AnalysisContext {
  scanHistory?: ScanHistoryBrief | null;
  previousAnalysis?: AnalysisOutput | null;
  strategyMemory?: StrategyMemory | null;
}

export interface AiRunner {
  analyze(
    snapshot: CapturedAccountSnapshot,
    jobDir: string,
    voiceBlock?: string,
    context?: AnalysisContext
  ): Promise<AnalysisOutput>;
}
