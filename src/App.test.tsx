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
    vi.fn(async () => new Response(JSON.stringify({ snapshot: null }), { status: 200 }))
  );

  render(<App />);

  expect(screen.getByText("X Strategy Room")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Analyze recent posts" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: /Import manually/i })).toBeInTheDocument();
});
