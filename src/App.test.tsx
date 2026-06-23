import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

test("renders the scaffold hero", () => {
  render(<App />);

  expect(screen.getByText("X Strategy Room")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Analyze recent posts" })).toBeInTheDocument();
});
