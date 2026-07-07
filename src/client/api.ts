import type { AnalysisOutput, AnalysisSummary } from "../shared/analysis-schema";
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

export type DashboardState = {
  snapshot: CapturedAccountSnapshot | null;
  history: CapturedAccountSnapshot[];
  analysis: AnalysisSummary | null;
  generation: GenerationOutput | null;
  strategyMemory: {
    memory: StrategyMemory | null;
    proposal: StrategyMemoryProposal | null;
  };
  topicExploration: TopicExplorationOutput | null;
  directions: CreativeDirectionEntry[];
};

export type CreativeDirectionEntry = { id: number; text: string; updatedAt: string };

declare global {
  interface Window {
    __socialAuditDashboardState?: unknown;
    __socialAuditDashboardStatePromise?: Promise<unknown>;
    __socialAuditDashboardStateSource?: "network" | "storage";
  }
}

let dashboardStatePromise: Promise<DashboardState> | null = null;
let bootstrappedDashboardStateSource: "network" | "storage" | null = null;
const dashboardStateStorageKey = "social-audit-dashboard-state-v1";

function storeDashboardState(data: DashboardState) {
  try {
    window.localStorage.setItem(dashboardStateStorageKey, JSON.stringify(data));
  } catch {
    // Local cache is a speed path only.
  }
}

function normalizeDashboardState(data: any): DashboardState {
  const dashboardState = {
    snapshot: data.snapshot ?? null,
    history: data.history ?? (data.snapshot ? [data.snapshot] : []),
    analysis: data.analysis ?? null,
    generation: data.generation ?? null,
    strategyMemory: {
      memory: data.strategyMemory?.memory ?? null,
      proposal: data.strategyMemory?.proposal ?? null
    },
    topicExploration: data.topicExploration ?? null,
    directions: Array.isArray(data.directions) ? data.directions : []
  };
  if (typeof window !== "undefined") storeDashboardState(dashboardState);
  return dashboardState;
}

async function fetchDashboardState(): Promise<DashboardState> {
  const response = await fetch("/api/dashboard");
  if (!response.ok) throw new Error("Failed to load latest snapshot");
  const data = await response.json();
  return normalizeDashboardState(data);
}

export function getDashboardState(options: { force?: boolean } = {}): Promise<DashboardState> {
  if (options.force) dashboardStatePromise = null;
  if (!dashboardStatePromise) {
    const bootstrapPromise = typeof window === "undefined" ? undefined : window.__socialAuditDashboardStatePromise;
    dashboardStatePromise = bootstrapPromise ? bootstrapPromise.then(normalizeDashboardState) : fetchDashboardState();
    if (typeof window !== "undefined") window.__socialAuditDashboardStatePromise = undefined;
  }
  return dashboardStatePromise;
}

export function getBootstrappedDashboardState(): DashboardState | null {
  if (typeof window === "undefined") return null;
  if (window.__socialAuditDashboardState) {
    bootstrappedDashboardStateSource = window.__socialAuditDashboardStateSource ?? "network";
    return normalizeDashboardState(window.__socialAuditDashboardState);
  }
  try {
    const cachedState = window.localStorage.getItem(dashboardStateStorageKey);
    if (!cachedState) return null;
    bootstrappedDashboardStateSource = "storage";
    return normalizeDashboardState(JSON.parse(cachedState));
  } catch {
    return null;
  }
}

export function isBootstrappedDashboardStateFromStorage() {
  return bootstrappedDashboardStateSource === "storage";
}

export function clearDashboardStateCacheForTests() {
  dashboardStatePromise = null;
  bootstrappedDashboardStateSource = null;
  if (typeof window === "undefined") return;
  window.__socialAuditDashboardState = undefined;
  window.__socialAuditDashboardStatePromise = undefined;
  window.__socialAuditDashboardStateSource = undefined;
  try {
    window.localStorage.removeItem(dashboardStateStorageKey);
  } catch {
    // Test/runtime storage may be unavailable.
  }
}

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

export type VoiceProfileState = {
  profile: import("../shared/voice-profile").VoiceProfile | null;
  derivedAt: string | null;
  overrides: string;
};

export async function getVoiceProfile(): Promise<VoiceProfileState> {
  const response = await fetch("/api/voice/latest");
  if (!response.ok) throw new Error("Failed to load voice profile");
  const data = await response.json();
  return { profile: data.profile ?? null, derivedAt: data.derivedAt ?? null, overrides: data.overrides ?? "" };
}

export async function refreshVoiceProfile(): Promise<VoiceProfileState> {
  const response = await fetch("/api/voice/refresh", { method: "POST" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Voice derivation failed");
  }
  return { profile: data.profile ?? null, derivedAt: data.derivedAt ?? null, overrides: data.overrides ?? "" };
}

export async function saveVoiceOverrides(text: string): Promise<string> {
  const response = await fetch("/api/voice/overrides", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Failed to save voice notes");
  }
  return data.overrides ?? "";
}

export async function saveCreativeDirection(text: string): Promise<CreativeDirectionEntry[]> {
  const response = await fetch("/api/direction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Failed to save creative direction");
  }
  return Array.isArray(data?.directions) ? data.directions : [];
}

export async function deleteCreativeDirection(id: number): Promise<CreativeDirectionEntry[]> {
  const response = await fetch(`/api/direction/${id}`, { method: "DELETE" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.errorMessage ?? "Failed to delete creative direction");
  }
  return Array.isArray(data?.directions) ? data.directions : [];
}
