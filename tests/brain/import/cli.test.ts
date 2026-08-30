import { closeSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLegacyImportArgs } from "../../../src/brain/import/cli";

describe("parseLegacyImportArgs", () => {
  it("accepts the documented --sqlite absolute-path invocation", () => {
    const sqlitePath = join(tmpdir(), `social-brain-cli-${crypto.randomUUID()}.sqlite`);
    closeSync(openSync(sqlitePath, "w"));
    try {
      expect(parseLegacyImportArgs(["--sqlite", sqlitePath])).toBe(sqlitePath);
    } finally {
      rmSync(sqlitePath);
    }
  });

  it("rejects the legacy positional invocation", () => {
    expect(() => parseLegacyImportArgs(["/absolute/path/to/file.sqlite"])).toThrow("Usage: --sqlite /absolute/path/to/file.sqlite");
  });
});
