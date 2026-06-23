import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analysisOutputSchema } from "../../src/shared/analysis-schema";
import { createServerApp } from "../../src/server/routes";
import analysisFixture from "../fixtures/analysis-valid.json";

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
    const baseUrl = await listen(createServerApp({ dataDir: dir }));

    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, service: "social-audit" });
  });

  it("imports a manual snapshot and returns latest snapshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "social-audit-api-"));
    const baseUrl = await listen(createServerApp({ dataDir: dir }));
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
    const baseUrl = await listen(createServerApp({ dataDir: dir }));

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
    const baseUrl = await listen(createServerApp({ dataDir: dir, aiRunner }));
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
    const baseUrl = await listen(createServerApp({ dataDir: dir, aiRunner }));
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
});
