import type { AnalysisOutput } from "../shared/analysis-schema";
import type { GenerationOutput } from "../shared/generation-schema";
import type {
  StrategyMemory,
  StrategyMemoryProposalOutput,
  TopicExplorationOutput
} from "../shared/strategy-intelligence-schema";
import type { CapturedAccountSnapshot } from "../shared/types";

export type StrategyMemoryProposal = StrategyMemoryProposalOutput & {
  id: number;
  createdAt?: string;
};

export async function getLatestSnapshot(): Promise<CapturedAccountSnapshot | null> {
  const response = await fetch("/api/latest");
  if (!response.ok) throw new Error("Failed to load latest snapshot");
  const data = await response.json();
  return data.snapshot ?? null;
}

export async function getLatestAnalysis(): Promise<AnalysisOutput | null> {
  const response = await fetch("/api/analysis/latest");
  if (!response.ok) throw new Error("Failed to load latest analysis");
  const data = await response.json();
  return data.analysis ?? null;
}

export async function getLatestGeneration(): Promise<GenerationOutput | null> {
  const response = await fetch("/api/generation/latest");
  if (!response.ok) throw new Error("Failed to load latest generated posts");
  const data = await response.json();
  return data.generation ?? null;
}

export async function getLatestStrategyMemory(): Promise<{
  memory: StrategyMemory | null;
  proposal: StrategyMemoryProposal | null;
}> {
  const response = await fetch("/api/strategy-memory/latest");
  if (!response.ok) throw new Error("Failed to load strategy memory");
  const data = await response.json();
  return {
    memory: data.memory ?? null,
    proposal: data.proposal ?? null
  };
}

export async function getLatestTopicExploration(): Promise<TopicExplorationOutput | null> {
  const response = await fetch("/api/topics/latest");
  if (!response.ok) throw new Error("Failed to load topic exploration");
  const data = await response.json();
  return data.exploration ?? null;
}

export async function importSnapshot(snapshot: unknown): Promise<void> {
  const response = await fetch("/api/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snapshot)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.errorMessage ?? "Import failed");
  }
}

export async function captureSnapshot(handle = "caseymcdougal"): Promise<CapturedAccountSnapshot> {
  const response = await fetch("/api/capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Capture failed");
  }
  return data.snapshot;
}

export async function analyzeLatestSnapshot(): Promise<AnalysisOutput> {
  const response = await fetch("/api/analyze", { method: "POST" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Analysis failed");
  }
  return data.output;
}

export async function generateTodaysIdeas(): Promise<GenerationOutput> {
  const response = await fetch("/api/generate/today", { method: "POST" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Generation failed");
  }
  return data.generation;
}

export async function refreshStrategyMemory(): Promise<StrategyMemoryProposal> {
  const response = await fetch("/api/strategy-memory/refresh", { method: "POST" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Strategy memory update failed");
  }
  return data.proposal;
}

export async function applyStrategyMemoryProposal(proposalId: number): Promise<StrategyMemory> {
  const response = await fetch("/api/strategy-memory/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proposalId })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Apply memory update failed");
  }
  return data.memory;
}

export async function exploreNearbyTopics(): Promise<TopicExplorationOutput> {
  const response = await fetch("/api/topics/explore", { method: "POST" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Topic exploration failed");
  }
  return data.exploration;
}
