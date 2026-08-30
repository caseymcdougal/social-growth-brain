import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analysisOutputSchema } from "../../src/shared/analysis-schema";
import { generationOutputSchema } from "../../src/shared/generation-schema";
import {
  strategyMemoryProposalOutputSchema,
  topicExplorationOutputSchema
} from "../../src/shared/strategy-intelligence-schema";
import { createServerApp } from "../../src/server/routes";
import type { StrategyIntelligenceRunner } from "../../src/server/strategy/strategy-intelligence-runner";
import analysisFixture from "../fixtures/analysis-valid.json";

const voiceProfileFixture = {
  summary: "Lowercase, terse build-log voice.",
  casing_and_punctuation: ["mostly lowercase"],
  sentence_rhythm: ["short declaratives"],
  vocabulary: ["build mode"],
  hook_moves: ["opens with a concrete action"],
  banned_moves: ["no hashtags"],
  style_excerpts: ["went from serving tables to shipping software"]
};

// Inject a stub voice runner so the auto-refresh after import/capture never spawns a real LLM subprocess.
function makeApp(options: Parameters<typeof createServerApp>[0]) {
  return createServerApp({
    voiceRunner: { deriveProfile: vi.fn(async () => voiceProfileFixture) },
    ...options
  });
}

const servers: { close: () => void }[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

function listen(app: ReturnType<typeof createServerApp>): Promise<string> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") resolve(`http://127.0.0.1:${address.port}`);
    });
    servers.push(server);
  });
}

describe("server routes", () => {
  it("reports API health", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const baseUrl = await listen(makeApp({ dataDir: dir }));

    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, service: "social-audit" });
  });

  it("imports a manual snapshot and returns latest snapshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const baseUrl = await listen(makeApp({ dataDir: dir }));
    const fixture = JSON.parse(readFileSync("tests/fixtures/manual-import-valid.json", "utf8"));

    const importResponse = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture)
    });
    expect(importResponse.status).toBe(200);

    const latestResponse = await fetch(`${baseUrl}/api/latest`);
    const latest = await latestResponse.json();
    expect(latest.snapshot.profile.handle).toBe("caseymcdougal");
    expect(latest.snapshot.posts).toHaveLength(1);
  });

  it("returns validation errors for invalid manual imports", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const baseUrl = await listen(makeApp({ dataDir: dir }));

    const response = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: { handle: "casey" }, posts: [] })
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.errorStage).toBe("manual_import_validation");
  });

  it("analyzes the latest snapshot with an injected AI runner", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const output = analysisOutputSchema.parse(analysisFixture);
    const aiRunner = { analyze: vi.fn(async () => output) };
    const baseUrl = await listen(makeApp({ dataDir: dir, aiRunner }));
    const fixture = JSON.parse(readFileSync("tests/fixtures/manual-import-valid.json", "utf8"));

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture)
    });

    const response = await fetch(`${baseUrl}/api/analyze`, { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(aiRunner.analyze).toHaveBeenCalledOnce();
    expect(body.output.executive_summary).toContain("specific and opinionated");
    expect(body.analysisRunId).toBeGreaterThan(0);
  });

  it("returns the latest successful analysis for the latest snapshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const output = analysisOutputSchema.parse(analysisFixture);
    const aiRunner = { analyze: vi.fn(async () => output) };
    const baseUrl = await listen(makeApp({ dataDir: dir, aiRunner }));
    const fixture = JSON.parse(readFileSync("tests/fixtures/manual-import-valid.json", "utf8"));

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture)
    });
    await fetch(`${baseUrl}/api/analyze`, { method: "POST" });

    const response = await fetch(`${baseUrl}/api/analysis/latest`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analysis.executive_summary).toContain("specific and opinionated");
    expect(body.analysis.next_post_ideas).toHaveLength(output.next_post_ideas.length);
    expect(body.analysis.post_analyses[0].post_id).toBe(output.post_analyses[0].post_id);
  });

  it("returns consolidated dashboard startup state", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const output = analysisOutputSchema.parse(analysisFixture);
    const aiRunner = { analyze: vi.fn(async () => output) };
    const baseUrl = await listen(makeApp({ dataDir: dir, aiRunner }));
    const fixture = JSON.parse(readFileSync("tests/fixtures/manual-import-valid.json", "utf8"));

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture)
    });
    await fetch(`${baseUrl}/api/analyze`, { method: "POST" });

    const response = await fetch(`${baseUrl}/api/dashboard`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.snapshot.profile.handle).toBe("caseymcdougal");
    expect(body.analysis.executive_summary).toContain("specific and opinionated");
    expect(body.generation).toBeNull();
    expect(body.strategyMemory).toEqual({ memory: null, proposal: null });
    expect(body.topicExploration).toBeNull();
  });

  it("returns recent scan history in dashboard startup state", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const baseUrl = await listen(makeApp({ dataDir: dir }));
    const fixture = JSON.parse(readFileSync("tests/fixtures/manual-import-valid.json", "utf8"));
    const olderFixture = {
      ...fixture,
      profile: { ...fixture.profile, capturedAt: "2026-06-20T18:00:00.000Z", followersCount: 1200 },
      posts: [
        {
          ...fixture.posts[0],
          xPostId: "older-post",
          url: "https://x.com/caseymcdougal/status/older-post",
          text: "Older scan post.",
          capturedAt: "2026-06-20T18:00:00.000Z",
          viewsCount: 500
        }
      ]
    };
    const newerFixture = {
      ...fixture,
      profile: { ...fixture.profile, capturedAt: "2026-06-26T18:00:00.000Z", followersCount: 1250 },
      posts: [
        {
          ...fixture.posts[0],
          xPostId: "newer-post",
          url: "https://x.com/caseymcdougal/status/newer-post",
          text: "Newer scan post.",
          capturedAt: "2026-06-26T18:00:00.000Z",
          viewsCount: 1500
        }
      ]
    };

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(olderFixture)
    });
    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(newerFixture)
    });

    const response = await fetch(`${baseUrl}/api/dashboard`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.history).toHaveLength(2);
    expect(body.history[0].profile.capturedAt).toBe("2026-06-26T18:00:00.000Z");
    expect(body.history[0].posts[0].xPostId).toBe("newer-post");
    expect(body.history[1].profile.capturedAt).toBe("2026-06-20T18:00:00.000Z");
  });

  it("requires a successful audit before generating today's ideas", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const baseUrl = await listen(makeApp({ dataDir: dir }));
    const fixture = JSON.parse(readFileSync("tests/fixtures/manual-import-valid.json", "utf8"));

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture)
    });

    const response = await fetch(`${baseUrl}/api/generate/today`, { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.errorStage).toBe("no_analysis");
  });

  it("generates today's ideas with an injected generation runner", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const output = analysisOutputSchema.parse(analysisFixture);
    const generation = generationOutputSchema.parse({
      posts: [
        {
          title: "Local dashboards should write back",
          angle: "Turn audit pain into a product opinion.",
          why_this: "The audit says direct product opinions are working.",
          hook: "A social dashboard that only reports metrics is unfinished.",
          draft:
            "A social dashboard that only reports metrics is unfinished. The useful part starts when it turns the pattern into the next post while the context is still fresh.",
          source_signal: "Direct product opinions and clear enemy framing."
        }
      ]
    });
    const aiRunner = { analyze: vi.fn(async () => output) };
    const generationRunner = { generateToday: vi.fn(async () => generation) };
    const baseUrl = await listen(makeApp({ dataDir: dir, aiRunner, generationRunner }));
    const fixture = JSON.parse(readFileSync("tests/fixtures/manual-import-valid.json", "utf8"));

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture)
    });
    await fetch(`${baseUrl}/api/analyze`, { method: "POST" });

    const response = await fetch(`${baseUrl}/api/generate/today`, { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(generationRunner.generateToday).toHaveBeenCalledOnce();
    expect(body.generation.posts[0].title).toBe("Local dashboards should write back");
  });

  it("returns the latest generated posts for the latest snapshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const output = analysisOutputSchema.parse(analysisFixture);
    const generation = generationOutputSchema.parse({
      posts: [
        {
          title: "Post Lab",
          angle: "Make generation explicit.",
          why_this: "The dashboard needs a visible next action.",
          hook: "The audit is not the product. The next post is.",
          draft: "The audit is not the product. The next post is. A content tool earns its keep when it turns the read into a draft.",
          source_signal: "Clear next-action workflow."
        },
        {
          title: "Second draft",
          angle: "Keep alternates visible.",
          why_this: "Operators need more than one option.",
          hook: "One draft is a suggestion. Three drafts are a choice.",
          draft: "One draft is a suggestion. Three drafts are a choice. Keep the queue wide enough to pick a true angle.",
          source_signal: "Choice over single-shot generation."
        },
        {
          title: "Third draft",
          angle: "Ship the mechanism, not the clone.",
          why_this: "Novelty matters.",
          hook: "If the draft sounds like yesterday, it is not ready.",
          draft: "If the draft sounds like yesterday, it is not ready. Write a new claim in the same lane and cut the rest.",
          source_signal: "Mechanism reuse."
        }
      ]
    });
    const baseUrl = await listen(
      makeApp({
        dataDir: dir,
        aiRunner: { analyze: vi.fn(async () => output) },
        generationRunner: { generateToday: vi.fn(async () => generation) }
      })
    );
    const fixture = JSON.parse(readFileSync("tests/fixtures/manual-import-valid.json", "utf8"));

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture)
    });
    await fetch(`${baseUrl}/api/analyze`, { method: "POST" });
    await fetch(`${baseUrl}/api/generate/today`, { method: "POST" });

    const response = await fetch(`${baseUrl}/api/generation/latest`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.generation.posts[0].draft).toContain("content tool earns");

    const dashboard = await fetch(`${baseUrl}/api/dashboard`);
    const dashboardBody = await dashboard.json();
    expect(dashboard.status).toBe(200);
    expect(dashboardBody.generation.posts).toHaveLength(3);
  });

  it("requires a successful audit before refreshing strategy memory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const baseUrl = await listen(makeApp({ dataDir: dir }));
    const fixture = JSON.parse(readFileSync("tests/fixtures/manual-import-valid.json", "utf8"));

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture)
    });

    const response = await fetch(`${baseUrl}/api/strategy-memory/refresh`, { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.errorStage).toBe("no_analysis");
  });

  it("creates and applies a strategy memory proposal with an injected runner", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const output = analysisOutputSchema.parse(analysisFixture);
    const proposal = strategyMemoryProposalOutputSchema.parse({
      memory: {
        positioning: "Casey writes as a local-first AI tooling operator.",
        audience_segments: ["builders shipping with AI"],
        strongest_lanes: ["local AI dashboards", "workflow critique"],
        weak_lanes: ["generic AI commentary"],
        voice_rules: ["make the product opinion first"],
        proof_points: ["Audit found specific product opinions outperform generic takes."],
        active_experiments: [
          {
            hypothesis: "Named workflow enemies increase replies.",
            status: "active",
            evidence: "The audit flagged clear enemy framing as a strong pattern."
          }
        ]
      },
      updates: [
        {
          area: "positioning",
          proposed: "Frame Casey as a local-first AI tooling operator.",
          reason: "This is supported by the current dashboard build and post audit.",
          evidence: "Top patterns favor specific product opinions."
        }
      ]
    });
    const strategyRunner = {
      generateMemoryProposal: vi.fn(async () => proposal),
      exploreTopics: vi.fn()
    };
    const baseUrl = await listen(
      makeApp({
        dataDir: dir,
        aiRunner: { analyze: vi.fn(async () => output) },
        strategyRunner
      })
    );
    const fixture = JSON.parse(readFileSync("tests/fixtures/manual-import-valid.json", "utf8"));

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture)
    });
    await fetch(`${baseUrl}/api/analyze`, { method: "POST" });

    const refreshResponse = await fetch(`${baseUrl}/api/strategy-memory/refresh`, { method: "POST" });
    const refreshBody = await refreshResponse.json();

    expect(refreshResponse.status).toBe(200);
    expect(strategyRunner.generateMemoryProposal).toHaveBeenCalledOnce();
    expect(refreshBody.proposal.updates[0].area).toBe("positioning");

    const latestBeforeApply = await (await fetch(`${baseUrl}/api/strategy-memory/latest`)).json();
    expect(latestBeforeApply.memory).toBeNull();
    expect(latestBeforeApply.proposal.id).toBe(refreshBody.proposal.id);

    const applyResponse = await fetch(`${baseUrl}/api/strategy-memory/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId: refreshBody.proposal.id })
    });
    const applyBody = await applyResponse.json();

    expect(applyResponse.status).toBe(200);
    expect(applyBody.memory.positioning).toContain("local-first");

    const latestAfterApply = await (await fetch(`${baseUrl}/api/strategy-memory/latest`)).json();
    expect(latestAfterApply.memory.positioning).toContain("local-first");
    expect(latestAfterApply.proposal).toBeNull();
  });

  it("explores nearby topics with accepted memory when available", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const output = analysisOutputSchema.parse(analysisFixture);
    const proposal = strategyMemoryProposalOutputSchema.parse({
      memory: {
        positioning: "Casey writes as a local-first AI tooling operator.",
        audience_segments: ["builders shipping with AI"],
        strongest_lanes: ["local AI dashboards"],
        weak_lanes: ["generic AI commentary"],
        voice_rules: ["make the product opinion first"],
        proof_points: ["Specific product opinions outperform generic takes."],
        active_experiments: [
          {
            hypothesis: "Local workflow posts can become a repeatable lane.",
            status: "active",
            evidence: "The audit recommended product-specific content pillars."
          }
        ]
      },
      updates: [
        {
          area: "strongest_lanes",
          proposed: "Add local AI dashboards.",
          reason: "It is supported by current build context.",
          evidence: "Recommended content pillars include AI tools Casey is building."
        }
      ]
    });
    const topics = topicExplorationOutputSchema.parse({
      topics: [
        {
          title: "Dashboards that remember taste",
          lane: "local AI dashboards",
          why_near: "It extends the dashboard work into a broader creator-tooling thesis.",
          evidence: ["Accepted memory says local AI dashboards are a strong lane."],
          risk: "low",
          hooks: ["Your dashboard should remember your taste.", "A content tool without memory is just a scoreboard."],
          draft:
            "A content tool without memory is just a scoreboard. The useful version remembers your taste, your strongest lanes, and the kinds of takes you should stop repeating.",
          follow_up_prompt: "Explore memory-first creator tools."
        }
      ]
    });
    const exploreTopics = vi.fn(async (_input: Parameters<StrategyIntelligenceRunner["exploreTopics"]>[0]) => topics);
    const strategyRunner = {
      generateMemoryProposal: vi.fn(async () => proposal),
      exploreTopics
    };
    const baseUrl = await listen(
      makeApp({
        dataDir: dir,
        aiRunner: { analyze: vi.fn(async () => output) },
        strategyRunner
      })
    );
    const fixture = JSON.parse(readFileSync("tests/fixtures/manual-import-valid.json", "utf8"));

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture)
    });
    await fetch(`${baseUrl}/api/analyze`, { method: "POST" });
    const proposalBody = await (await fetch(`${baseUrl}/api/strategy-memory/refresh`, { method: "POST" })).json();
    await fetch(`${baseUrl}/api/strategy-memory/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId: proposalBody.proposal.id })
    });

    const exploreResponse = await fetch(`${baseUrl}/api/topics/explore`, { method: "POST" });
    const exploreBody = await exploreResponse.json();

    expect(exploreResponse.status).toBe(200);
    expect(exploreTopics).toHaveBeenCalledOnce();
    expect(exploreTopics.mock.calls[0]).toBeDefined();
    const topicCall = exploreTopics.mock.calls[0]?.[0];
    if (!topicCall?.currentMemory) throw new Error("Expected topic exploration to receive accepted memory");
    expect(topicCall.currentMemory.positioning).toContain("local-first");
    expect(exploreBody.exploration.topics[0].title).toBe("Dashboards that remember taste");

    const latestTopics = await (await fetch(`${baseUrl}/api/topics/latest`)).json();
    expect(latestTopics.exploration.topics[0].draft).toContain("scoreboard");
  });

  it("derives, stores, and injects the voice profile into analysis", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const output = analysisOutputSchema.parse(analysisFixture);
    const analyze = vi.fn(async (_snapshot: unknown, _jobDir: string, _voiceBlock?: string) => output);
    const baseUrl = await listen(makeApp({ dataDir: dir, aiRunner: { analyze } }));
    const fixture = JSON.parse(readFileSync("tests/fixtures/manual-import-valid.json", "utf8"));

    await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture)
    });

    const refreshBody = await (await fetch(`${baseUrl}/api/voice/refresh`, { method: "POST" })).json();
    expect(refreshBody.ok).toBe(true);
    expect(refreshBody.profile.summary).toContain("build-log");

    const latestBody = await (await fetch(`${baseUrl}/api/voice/latest`)).json();
    expect(latestBody.profile.banned_moves).toContain("no hashtags");
    expect(latestBody.derivedAt).toBeTruthy();

    const overridesBody = await (
      await fetch(`${baseUrl}/api/voice/overrides`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "never use em dashes" })
      })
    ).json();
    expect(overridesBody.overrides).toBe("never use em dashes");

    await fetch(`${baseUrl}/api/analyze`, { method: "POST" });
    expect(analyze).toHaveBeenCalledOnce();
    const voiceBlock = analyze.mock.calls[0]?.[2] ?? "";
    expect(voiceBlock).toContain("no hashtags");
    expect(voiceBlock).toContain("never use em dashes");
  });

  it("returns 409 when deriving a voice profile with no snapshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const baseUrl = await listen(makeApp({ dataDir: dir }));

    const response = await fetch(`${baseUrl}/api/voice/refresh`, { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.errorStage).toBe("no_snapshot");
  });
});

it("POST /api/direction rejects a missing or empty text body instead of silently no-opping", async () => {
  const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
  const baseUrl = await listen(makeApp({ dataDir: dir }));
  const post = (body: unknown) =>
    fetch(`${baseUrl}/api/direction`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

  expect((await post({ direction: "comeback post" })).status).toBe(400);
  expect((await post({ text: "   " })).status).toBe(400);

  const valid = await post({ text: "comeback post" });
  expect(valid.status).toBe(200);
  const body = await valid.json();
  expect(body.directions.some((d: { text: string }) => d.text === "comeback post")).toBe(true);
});
