import { describe, it, expect } from "vitest";
import { openDatabase } from "./db";
import { createRepositories } from "./repositories";

function freshRepos() {
  // openDatabase runs the migrate() schema; ":memory:" keeps it isolated per test.
  const db = openDatabase(":memory:");
  return createRepositories(db);
}

describe("creative direction", () => {
  it("returns null when unset", () => {
    expect(freshRepos().getCreativeDirection()).toBeNull();
  });

  it("stores and returns latest text", () => {
    const repos = freshRepos();
    repos.setCreativeDirection("Lean into build-in-public");
    const stored = repos.getCreativeDirection();
    expect(stored?.text).toBe("Lean into build-in-public");
    expect(typeof stored?.updatedAt).toBe("string");
  });

  it("latest write wins", () => {
    const repos = freshRepos();
    repos.setCreativeDirection("first");
    repos.setCreativeDirection("second");
    expect(repos.getCreativeDirection()?.text).toBe("second");
  });

  it("empty text clears the direction", () => {
    const repos = freshRepos();
    repos.setCreativeDirection("something");
    repos.setCreativeDirection("   ");
    expect(repos.getCreativeDirection()).toBeNull();
  });
});
