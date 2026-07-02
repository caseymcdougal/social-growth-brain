import { describe, it, expect } from "vitest";
import { openDatabase } from "./db";
import { createRepositories } from "./repositories";

function freshRepos() {
  // openDatabase runs the migrate() schema; ":memory:" keeps it isolated per test.
  const db = openDatabase(":memory:");
  return createRepositories(db);
}

describe("creative direction", () => {
  it("returns null and empty list when unset", () => {
    const repos = freshRepos();
    expect(repos.getCreativeDirection()).toBeNull();
    expect(repos.listCreativeDirections()).toEqual([]);
  });

  it("adds entries and lists newest first", () => {
    const repos = freshRepos();
    repos.addCreativeDirection("first");
    repos.addCreativeDirection("second");
    const entries = repos.listCreativeDirections();
    expect(entries.map((entry) => entry.text)).toEqual(["second", "first"]);
    expect(typeof entries[0].updatedAt).toBe("string");
  });

  it("ignores blank text", () => {
    const repos = freshRepos();
    expect(repos.addCreativeDirection("   ")).toBeNull();
    expect(repos.listCreativeDirections()).toEqual([]);
  });

  it("joins all entries for generation, oldest first", () => {
    const repos = freshRepos();
    repos.addCreativeDirection("first");
    repos.addCreativeDirection("second");
    expect(repos.getCreativeDirection()?.text).toBe("first\nsecond");
  });

  it("deletes an entry by id", () => {
    const repos = freshRepos();
    const kept = repos.addCreativeDirection("keep");
    const removed = repos.addCreativeDirection("remove");
    repos.deleteCreativeDirection(removed!.id);
    expect(repos.listCreativeDirections().map((entry) => entry.id)).toEqual([kept!.id]);
    expect(repos.getCreativeDirection()?.text).toBe("keep");
  });
});
