import express from "express";
import { join } from "node:path";
import { parseManualImportJson } from "../shared/manual-import";
import { CodexCliRunner } from "./ai/codex-cli-runner";
import type { AiRunner } from "./ai/ai-runner";
import { BrowserHarnessXCaptureRunner } from "./capture/browser-harness-x";
import { CaptureError, type CaptureRunner } from "./capture/capture-runner";
import { FallbackCaptureRunner } from "./capture/fallback-capture-runner";
import { createXMcpCaptureRunnerFromEnv } from "./capture/x-mcp-capture";
import { openDatabase } from "./db";
import { CodexGenerationRunner } from "./generation/codex-generation-runner";
import type { GenerationRunner } from "./generation/generation-runner";
import { createJobDir } from "./jobs";
import { createRepositories } from "./repositories";
import { CodexStrategyIntelligenceRunner } from "./strategy/codex-strategy-intelligence-runner";
import type { StrategyIntelligenceRunner } from "./strategy/strategy-intelligence-runner";
import { LlmVoiceProfileRunner, type VoiceProfileRunner } from "./voice/voice-profile-runner";
import { runQualityGatedGeneration } from "../shared/generation-quality";
import { buildScanHistoryBrief } from "../shared/scan-history";
import { buildVoicePromptBlock } from "../shared/voice-profile";

export function createServerApp(options: {
  dataDir: string;
  aiRunner?: AiRunner;
  captureRunner?: CaptureRunner;
  generationRunner?: GenerationRunner;
  strategyRunner?: StrategyIntelligenceRunner;
  voiceRunner?: VoiceProfileRunner;
}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const db = openDatabase(join(options.dataDir, "social-audit.sqlite"));
  const repos = createRepositories(db);
  const captureRunner = options.captureRunner ?? createDefaultCaptureRunner();
  const aiRunner = options.aiRunner ?? new CodexCliRunner();
  const generationRunner = options.generationRunner ?? new CodexGenerationRunner();
  const strategyRunner = options.strategyRunner ?? new CodexStrategyIntelligenceRunner();
  const voiceRunner = options.voiceRunner ?? new LlmVoiceProfileRunner();

  function currentVoiceBlock(): string {
    return buildVoicePromptBlock({
      profile: repos.getLatestVoiceProfile()?.profile ?? null,
      overrides: repos.getVoiceOverrides()
    });
  }

  async function refreshVoiceProfile(profileSnapshotId: number) {
    const snapshot = repos.getLatestSnapshot();
    if (!snapshot || snapshot.posts.length === 0) throw new Error("No posts captured for voice derivation");
    const jobDir = createJobDir(options.dataDir, "voice-profile");
    const profile = await voiceRunner.deriveProfile({ snapshot, jobDir });
    repos.saveVoiceProfile({ profileSnapshotId, jobDir, profile });
    return profile;
  }

  // ponytail: fire-and-forget after capture/import; failures only logged, capture never blocks on voice
  function refreshVoiceProfileInBackground(profileSnapshotId: number) {
    void refreshVoiceProfile(profileSnapshotId).catch((error) => {
      console.error("[voice] background refresh failed:", error instanceof Error ? error.message : error);
    });
  }

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, service: "social-audit" });
  });

  app.post("/api/import", (request, response) => {
    try {
      const snapshot = parseManualImportJson(JSON.stringify(request.body));
      const profileSnapshotId = repos.saveCapturedSnapshot(snapshot);
      refreshVoiceProfileInBackground(profileSnapshotId);
      response.json({ ok: true, profileSnapshotId });
    } catch (error) {
      response.status(400).json({
        ok: false,
        errorStage: "manual_import_validation",
        errorMessage: error instanceof Error ? error.message : "Manual import failed"
      });
    }
  });

  app.get("/api/latest", (_request, response) => {
    response.json({ snapshot: repos.getLatestSnapshot() });
  });

  app.get("/api/dashboard", (_request, response) => {
    const snapshot = repos.getLatestSnapshot();
    const analysis = snapshot ? repos.getLatestAnalysisSummaryForLatestSnapshot() : null;
    const generation = analysis ? repos.getLatestGenerationForLatestSnapshot() : null;
    response.json({
      snapshot,
      history: repos.getRecentSnapshots(6),
      analysis,
      generation,
      strategyMemory: { memory: null, proposal: null },
      topicExploration: null,
      directions: repos.listCreativeDirections()
    });
  });

  app.get("/api/direction", (_request, response) => {
    response.json({ ok: true, directions: repos.listCreativeDirections() });
  });

  app.post("/api/direction", (request, response) => {
    const text = typeof request.body?.text === "string" ? request.body.text : "";
    repos.addCreativeDirection(text);
    response.json({ ok: true, directions: repos.listCreativeDirections() });
  });

  app.delete("/api/direction/:id", (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) {
      response.status(400).json({ ok: false, errorMessage: "Invalid direction id" });
      return;
    }
    repos.deleteCreativeDirection(id);
    response.json({ ok: true, directions: repos.listCreativeDirections() });
  });

  app.get("/api/analysis/latest", (_request, response) => {
    response.json({ analysis: repos.getLatestAnalysisForLatestSnapshot() });
  });

  app.get("/api/generation/latest", (_request, response) => {
    response.json({ generation: repos.getLatestGenerationForLatestSnapshot() });
  });

  app.get("/api/strategy-memory/latest", (_request, response) => {
    response.json({
      memory: repos.getLatestStrategyMemory()?.memory ?? null,
      proposal: repos.getLatestPendingStrategyMemoryProposal()
    });
  });

  app.get("/api/topics/latest", (_request, response) => {
    response.json({ exploration: repos.getLatestTopicExplorationForLatestSnapshot() });
  });

  app.post("/api/capture", async (request, response) => {
    try {
      const handle = typeof request.body?.handle === "string" ? request.body.handle : "caseymcdougal";
      const snapshot = await captureRunner.captureRecentPosts(handle);
      const profileSnapshotId = repos.saveCapturedSnapshot(snapshot);
      refreshVoiceProfileInBackground(profileSnapshotId);
      response.json({ ok: true, profileSnapshotId, snapshot });
    } catch (error) {
      if (error instanceof CaptureError) {
        response.status(422).json({ ok: false, errorStage: error.stage, errorMessage: error.message });
        return;
      }
      response.status(500).json({
        ok: false,
        errorStage: "parser_failed",
        errorMessage: error instanceof Error ? error.message : "Capture failed"
      });
    }
  });

  app.post("/api/analyze", async (_request, response) => {
    const snapshot = repos.getLatestSnapshot();
    if (!snapshot) {
      response.status(409).json({
        ok: false,
        errorStage: "no_snapshot",
        errorMessage: "Import or capture posts before analysis"
      });
      return;
    }

    const jobDir = createJobDir(options.dataDir, "analysis");
    try {
      const output = await aiRunner.analyze(snapshot, jobDir, currentVoiceBlock(), {
        scanHistory: buildScanHistoryBrief(repos.getRecentSnapshots(6)),
        previousAnalysis: repos.getMostRecentAnalysis(),
        strategyMemory: repos.getLatestStrategyMemory()?.memory ?? null
      });
      const latestProfile = db
        .prepare("SELECT id FROM profile_snapshots ORDER BY captured_at DESC, id DESC LIMIT 1")
        .get() as { id: number } | undefined;
      if (!latestProfile) {
        response.status(409).json({
          ok: false,
          errorStage: "no_snapshot",
          errorMessage: "Import or capture posts before analysis"
        });
        return;
      }
      const analysisRunId = repos.saveAnalysis(latestProfile.id, jobDir, output);
      response.json({ ok: true, analysisRunId, output });
    } catch (error) {
      response.status(500).json({
        ok: false,
        errorStage: "ai_runner_failed",
        errorMessage: error instanceof Error ? error.message : "Analysis failed",
        jobDir
      });
    }
  });

  app.post("/api/generate/today", async (_request, response) => {
    const snapshot = repos.getLatestSnapshot();
    if (!snapshot) {
      response.status(409).json({
        ok: false,
        errorStage: "no_snapshot",
        errorMessage: "Import or capture posts before generation"
      });
      return;
    }

    const latestAnalysis = repos.getLatestAnalysisRecordForLatestSnapshot();
    if (!latestAnalysis) {
      response.status(409).json({
        ok: false,
        errorStage: "no_analysis",
        errorMessage: "Run a strategy audit before generating posts"
      });
      return;
    }

    const jobDir = createJobDir(options.dataDir, "generation");
    try {
      const priorDrafts = repos.getRecentGeneratedDraftSnippets(12);
      const strategyMemory = repos.getLatestStrategyMemory()?.memory ?? null;
      const direction = repos.getCreativeDirection()?.text ?? null;
      const voiceBlock = currentVoiceBlock();
      let pass = 0;
      const gated = await runQualityGatedGeneration({
        snapshot,
        priorDrafts,
        generate: async (repairNotes) => {
          pass += 1;
          const passJobDir = pass === 1 ? jobDir : createJobDir(options.dataDir, "generation-repair");
          return generationRunner.generateToday({
            snapshot,
            analysis: latestAnalysis.analysis,
            strategyMemory,
            direction,
            voiceBlock,
            priorDrafts,
            repairNotes,
            jobDir: passJobDir
          });
        }
      });
      const generation = gated.generation;
      const generationRunId = repos.saveGeneration({
        profileSnapshotId: latestAnalysis.profileSnapshotId,
        analysisRunId: latestAnalysis.analysisRunId,
        jobDir,
        mode: "today",
        output: generation
      });
      response.json({
        ok: true,
        generationRunId,
        generation,
        quality: {
          repaired: gated.repaired,
          accepted: gated.firstPass.accepted.length + (gated.repairPass?.accepted.length ?? 0),
          rejected: gated.firstPass.rejected.length + (gated.repairPass?.rejected.length ?? 0)
        }
      });
    } catch (error) {
      response.status(500).json({
        ok: false,
        errorStage: "generation_runner_failed",
        errorMessage: error instanceof Error ? error.message : "Generation failed",
        jobDir
      });
    }
  });

  app.post("/api/strategy-memory/refresh", async (_request, response) => {
    const snapshot = repos.getLatestSnapshot();
    if (!snapshot) {
      response.status(409).json({
        ok: false,
        errorStage: "no_snapshot",
        errorMessage: "Import or capture posts before updating strategy memory"
      });
      return;
    }

    const latestAnalysis = repos.getLatestAnalysisRecordForLatestSnapshot();
    if (!latestAnalysis) {
      response.status(409).json({
        ok: false,
        errorStage: "no_analysis",
        errorMessage: "Run a strategy audit before updating strategy memory"
      });
      return;
    }

    const jobDir = createJobDir(options.dataDir, "strategy-memory");
    try {
      const currentMemory = repos.getLatestStrategyMemory();
      const output = await strategyRunner.generateMemoryProposal({
        snapshot,
        analysis: latestAnalysis.analysis,
        currentMemory: currentMemory?.memory ?? null,
        direction: repos.getCreativeDirection()?.text ?? null,
        jobDir
      });
      const proposalId = repos.saveStrategyMemoryProposal({
        profileSnapshotId: latestAnalysis.profileSnapshotId,
        analysisRunId: latestAnalysis.analysisRunId,
        jobDir,
        output
      });
      response.json({
        ok: true,
        proposal: {
          id: proposalId,
          ...output
        }
      });
    } catch (error) {
      response.status(500).json({
        ok: false,
        errorStage: "strategy_memory_runner_failed",
        errorMessage: error instanceof Error ? error.message : "Strategy memory update failed",
        jobDir
      });
    }
  });

  app.post("/api/strategy-memory/apply", (request, response) => {
    const proposalId = Number(request.body?.proposalId);
    if (!Number.isInteger(proposalId) || proposalId < 1) {
      response.status(400).json({
        ok: false,
        errorStage: "invalid_proposal",
        errorMessage: "Provide a valid proposalId"
      });
      return;
    }

    const applied = repos.applyStrategyMemoryProposal(proposalId);
    if (!applied) {
      response.status(404).json({
        ok: false,
        errorStage: "proposal_not_found",
        errorMessage: "No pending strategy memory proposal was found"
      });
      return;
    }

    response.json({ ok: true, memoryId: applied.id, memory: applied.memory });
  });

  app.get("/api/voice/latest", (_request, response) => {
    const latest = repos.getLatestVoiceProfile();
    response.json({
      ok: true,
      profile: latest?.profile ?? null,
      derivedAt: latest?.derivedAt ?? null,
      overrides: repos.getVoiceOverrides()
    });
  });

  app.put("/api/voice/overrides", (request, response) => {
    const text = typeof request.body?.text === "string" ? request.body.text : null;
    if (text === null) {
      response.status(400).json({ ok: false, errorStage: "invalid_overrides", errorMessage: "Provide overrides text" });
      return;
    }
    repos.setVoiceOverrides(text);
    response.json({ ok: true, overrides: repos.getVoiceOverrides() });
  });

  app.post("/api/voice/refresh", async (_request, response) => {
    const latestProfile = db
      .prepare("SELECT id FROM profile_snapshots ORDER BY captured_at DESC, id DESC LIMIT 1")
      .get() as { id: number } | undefined;
    if (!latestProfile) {
      response.status(409).json({
        ok: false,
        errorStage: "no_snapshot",
        errorMessage: "Import or capture posts before deriving a voice profile"
      });
      return;
    }

    try {
      const profile = await refreshVoiceProfile(latestProfile.id);
      const latest = repos.getLatestVoiceProfile();
      response.json({ ok: true, profile, derivedAt: latest?.derivedAt ?? null, overrides: repos.getVoiceOverrides() });
    } catch (error) {
      response.status(500).json({
        ok: false,
        errorStage: "voice_runner_failed",
        errorMessage: error instanceof Error ? error.message : "Voice derivation failed"
      });
    }
  });

  app.post("/api/topics/explore", async (_request, response) => {
    const snapshot = repos.getLatestSnapshot();
    if (!snapshot) {
      response.status(409).json({
        ok: false,
        errorStage: "no_snapshot",
        errorMessage: "Import or capture posts before exploring topics"
      });
      return;
    }

    const latestAnalysis = repos.getLatestAnalysisRecordForLatestSnapshot();
    if (!latestAnalysis) {
      response.status(409).json({
        ok: false,
        errorStage: "no_analysis",
        errorMessage: "Run a strategy audit before exploring topics"
      });
      return;
    }

    const currentMemory = repos.getLatestStrategyMemory();
    const jobDir = createJobDir(options.dataDir, "topic-explorer");
    try {
      const exploration = await strategyRunner.exploreTopics({
        snapshot,
        analysis: latestAnalysis.analysis,
        currentMemory: currentMemory?.memory ?? null,
        direction: repos.getCreativeDirection()?.text ?? null,
        jobDir
      });
      const topicRunId = repos.saveTopicExploration({
        profileSnapshotId: latestAnalysis.profileSnapshotId,
        analysisRunId: latestAnalysis.analysisRunId,
        strategyMemoryId: currentMemory?.id ?? null,
        jobDir,
        output: exploration
      });
      response.json({ ok: true, topicRunId, exploration });
    } catch (error) {
      response.status(500).json({
        ok: false,
        errorStage: "topic_explorer_runner_failed",
        errorMessage: error instanceof Error ? error.message : "Topic exploration failed",
        jobDir
      });
    }
  });

  return app;
}

function createDefaultCaptureRunner(): CaptureRunner {
  const browserRunner = new BrowserHarnessXCaptureRunner();
  const mcpRunner = createXMcpCaptureRunnerFromEnv();
  return mcpRunner ? new FallbackCaptureRunner(mcpRunner, browserRunner) : browserRunner;
}
