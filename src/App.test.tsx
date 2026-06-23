import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import analysisFixture from "../tests/fixtures/analysis-valid.json";
import snapshotFixture from "../tests/fixtures/manual-import-valid.json";
import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders the dashboard shell", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/analysis/latest")) {
        return new Response(JSON.stringify({ analysis: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ snapshot: null }), { status: 200 });
    })
  );

  render(<App />);

  expect(screen.getByText("Private X strategy room")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "X Audit Cockpit" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: /Paste snapshot/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Run strategy audit/i })).toBeDisabled();
});

test("shows generate today's ideas after an audit is available", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/latest")) {
        return new Response(JSON.stringify({ snapshot: snapshotFixture }), { status: 200 });
      }
      if (url.endsWith("/api/analysis/latest")) {
        return new Response(JSON.stringify({ analysis: analysisFixture }), { status: 200 });
      }
      if (url.endsWith("/api/generation/latest")) {
        return new Response(JSON.stringify({ generation: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  expect(await screen.findByRole("button", { name: /Generate today's ideas/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Re-run audit/i })).toBeInTheDocument();
});

test("shows strategy memory and topic explorer actions after an audit is available", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/latest")) {
        return new Response(JSON.stringify({ snapshot: snapshotFixture }), { status: 200 });
      }
      if (url.endsWith("/api/analysis/latest")) {
        return new Response(JSON.stringify({ analysis: analysisFixture }), { status: 200 });
      }
      if (url.endsWith("/api/generation/latest")) {
        return new Response(JSON.stringify({ generation: null }), { status: 200 });
      }
      if (url.endsWith("/api/strategy-memory/latest")) {
        return new Response(JSON.stringify({ memory: null, proposal: null }), { status: 200 });
      }
      if (url.endsWith("/api/topics/latest")) {
        return new Response(JSON.stringify({ exploration: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );

  render(<App />);

  expect(await screen.findByRole("button", { name: /Update strategy memory/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Explore nearby topics/i })).toBeInTheDocument();
});
