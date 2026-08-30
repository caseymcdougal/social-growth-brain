import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { runReadOnlyStdioServer } from "../../../src/brain/interfaces/mcp/stdio";

function dependencies() {
  const stdin = new EventEmitter();
  return {
    stdin,
    transport: { close: vi.fn().mockResolvedValue(undefined) },
    server: { connect: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) },
    pool: { end: vi.fn().mockResolvedValue(undefined) },
    migrate: vi.fn().mockResolvedValue(undefined),
    logError: vi.fn()
  };
}

describe("stdio MCP lifecycle", () => {
  it("closes the server and pool once on stdin EOF without stdout diagnostics", async () => {
    const value = dependencies();
    const running = runReadOnlyStdioServer(value);
    value.stdin.emit("end");
    await running;
    expect(value.server.close).toHaveBeenCalledOnce();
    expect(value.pool.end).toHaveBeenCalledOnce();
    expect(value.logError).not.toHaveBeenCalled();
  });

  it("cleans up once and reports input errors through stderr logger", async () => {
    const value = dependencies();
    const running = runReadOnlyStdioServer(value);
    value.stdin.emit("error", new Error("broken stdin"));
    await running;
    expect(value.server.close).toHaveBeenCalledOnce();
    expect(value.pool.end).toHaveBeenCalledOnce();
    expect(value.logError).toHaveBeenCalledWith("Social Brain MCP stdin error", expect.any(Error));
  });
});
