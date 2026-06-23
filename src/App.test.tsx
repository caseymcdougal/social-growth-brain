import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
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
