import { createHash } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { connect as connectSocket, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  X_OAUTH_REDIRECT_URI,
  createPkceAuthorization,
  exchangePkceCode,
  waitForPkceCallback
} from "../../../src/brain/import/x-oauth-pkce";

const SECRET_CODE = "authorization-code-must-not-appear-in-errors";
const SECRET_TOKEN = "access-token-must-not-appear-in-errors";
const servers: ReturnType<typeof createServer>[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

function fixedRandomBytes(): typeof import("node:crypto").randomBytes {
  let call = 0;
  return ((size: number) => Buffer.alloc(size, call++)) as typeof import("node:crypto").randomBytes;
}

async function freeRedirectUri(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    servers.push(server);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No loopback port available"));
      server.close((error) => error ? reject(error) : resolve(`http://127.0.0.1:${address.port}/callback`));
    });
  });
}

function requestLocal(url: string, method = "GET"): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.once("error", reject);
    request.end();
  });
}

function requestRawPath(redirectUri: string, path: string, method = "GET"): Promise<{ status: number; body: string }> {
  const url = new URL(redirectUri);
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port: Number(url.port), path, method }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.once("error", reject);
    request.end();
  });
}

async function requestWhenListening(url: string, method = "GET"): Promise<{ status: number; body: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await requestLocal(url, method);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ECONNREFUSED") throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw lastError;
}

async function rawPathWhenListening(redirectUri: string, path: string, method = "GET"): Promise<{ status: number; body: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await requestRawPath(redirectUri, path, method);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ECONNREFUSED") throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw lastError;
}

function openLocalSocket(redirectUri: string): Promise<Socket> {
  const url = new URL(redirectUri);
  return new Promise((resolve, reject) => {
    const socket = connectSocket({ host: "127.0.0.1", port: Number(url.port) });
    socket.once("connect", () => {
      socket.off("error", reject);
      socket.on("error", () => undefined);
      resolve(socket);
    });
    socket.once("error", reject);
  });
}

async function socketWhenListening(redirectUri: string): Promise<Socket> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await openLocalSocket(redirectUri);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ECONNREFUSED") throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw lastError;
}

function socketClosed(socket: Socket): Promise<void> {
  if (socket.destroyed) return Promise.resolve();
  return new Promise((resolve) => socket.once("close", () => resolve()));
}

function resolvesPromptly<T>(promise: Promise<T>, timeoutMs = 500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Local callback did not settle promptly")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error: unknown) => { clearTimeout(timeout); reject(error); }
    );
  });
}

async function assertPortReusable(redirectUri: string): Promise<void> {
  const url = new URL(redirectUri);
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    servers.push(server);
    server.once("error", reject);
    server.listen(Number(url.port), "127.0.0.1", () => server.close((error) => error ? reject(error) : resolve()));
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("createPkceAuthorization", () => {
  it("creates an exact fixed-host, read-only S256 authorization request", () => {
    const authorization = createPkceAuthorization({
      clientId: "public-client-id",
      randomBytes: fixedRandomBytes()
    });

    expect(X_OAUTH_REDIRECT_URI).toBe("http://127.0.0.1:8787/callback");
    expect(authorization.authorizationUrl.origin + authorization.authorizationUrl.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect([...authorization.authorizationUrl.searchParams.entries()]).toEqual([
      ["response_type", "code"],
      ["client_id", "public-client-id"],
      ["redirect_uri", X_OAUTH_REDIRECT_URI],
      ["scope", "tweet.read users.read"],
      ["state", authorization.state],
      ["code_challenge", createHash("sha256").update(authorization.codeVerifier).digest("base64url")],
      ["code_challenge_method", "S256"]
    ]);
    expect(authorization.state).toBe(Buffer.alloc(32, 0).toString("base64url"));
    expect(authorization.codeVerifier).toBe(Buffer.alloc(64, 1).toString("base64url"));
    expect(authorization.authorizationUrl.searchParams.get("scope")).not.toContain("offline.access");
  });

  it.each([
    "https://127.0.0.1:8787/callback",
    "http://localhost:8787/callback",
    "http://127.0.0.1/callback",
    "http://127.0.0.1:0/callback",
    "http://127.0.0.1:65536/callback",
    "http://127.0.0.1:8787/not-callback",
    "http://127.0.0.1:8787/callback/",
    "http://127.0.0.1:8787/callback?query=1",
    "http://127.0.0.1:8787/callback?",
    "http://127.0.0.1:8787/callback#fragment",
    "http://127.0.0.1:8787/callback#"
  ])("rejects unsafe redirect URI %s", (redirectUri) => {
    expect(() => createPkceAuthorization({ clientId: "public-client-id", redirectUri })).toThrow(/loopback redirect/i);
  });

  it("rejects a blank client ID before generating state", () => {
    expect(() => createPkceAuthorization({ clientId: " \n", randomBytes: fixedRandomBytes() })).toThrow(/client ID/i);
  });
});

describe("waitForPkceCallback", () => {
  it("accepts only the matching GET callback and closes the listener", async () => {
    const redirectUri = await freeRedirectUri();
    const waiting = waitForPkceCallback({ expectedState: "expected-state", redirectUri, timeoutMs: 1_000 });

    const response = await requestWhenListening(`${redirectUri}?code=${encodeURIComponent(SECRET_CODE)}&state=expected-state`);
    await expect(waiting).resolves.toBe(SECRET_CODE);
    expect(response.status).toBe(200);
    expect(response.body).not.toContain(SECRET_CODE);
    expect(response.body).not.toContain("expected-state");
    await assertPortReusable(redirectUri);
  });

  it("force-closes half-open local sockets after a valid callback", async () => {
    const redirectUri = await freeRedirectUri();
    const waiting = waitForPkceCallback({ expectedState: "expected-state", redirectUri, timeoutMs: 1_000 });
    const halfOpenSocket = await socketWhenListening(redirectUri);
    sockets.push(halfOpenSocket);

    const response = await requestWhenListening(`${redirectUri}?code=${encodeURIComponent(SECRET_CODE)}&state=expected-state`);
    await expect(resolvesPromptly(waiting)).resolves.toBe(SECRET_CODE);
    expect(response.status).toBe(200);
    await socketClosed(halfOpenSocket);
    await assertPortReusable(redirectUri);
  });

  it("keeps listening after invalid local callbacks and accepts a later matching callback", async () => {
    const redirectUri = await freeRedirectUri();
    const origin = new URL(redirectUri).origin;
    const waiting = waitForPkceCallback({ expectedState: "expected-state", redirectUri, timeoutMs: 1_000 });
    const success = expect(waiting).resolves.toBe(SECRET_CODE);
    const invalidResponses = [
      await requestWhenListening(`${redirectUri}?code=${encodeURIComponent(SECRET_CODE)}&state=wrong-state`),
      await requestWhenListening(`${redirectUri}?state=expected-state`),
      await requestWhenListening(`${redirectUri}?error=access_denied&state=wrong-state&error_description=${encodeURIComponent(SECRET_TOKEN)}`),
      await requestWhenListening(`${redirectUri}?error=&state=expected-state`),
      await requestWhenListening(`${redirectUri}?code=${encodeURIComponent(SECRET_CODE)}&state=expected-state`, "POST"),
      await requestWhenListening(`${origin}/not-callback?code=${encodeURIComponent(SECRET_CODE)}&state=expected-state`),
      await rawPathWhenListening(
      redirectUri,
      `/\\evil.example/callback?code=${encodeURIComponent(SECRET_CODE)}&state=expected-state`
      )
    ];
    expect(invalidResponses.map((response) => response.status)).toEqual([400, 400, 400, 400, 405, 404, 404]);
    for (const response of invalidResponses) {
      expect(response.body).not.toContain(SECRET_CODE);
      expect(response.body).not.toContain(SECRET_TOKEN);
      expect(response.body).not.toContain("expected-state");
      expect(response.body).not.toContain("wrong-state");
    }

    const validResponse = await requestWhenListening(`${redirectUri}?code=${encodeURIComponent(SECRET_CODE)}&state=expected-state`);
    await success;
    expect(validResponse.status).toBe(200);
    expect(validResponse.body).not.toContain(SECRET_CODE);
    await assertPortReusable(redirectUri);
  });

  it("rejects only a matching-state OAuth denial and closes the listener", async () => {
    const redirectUri = await freeRedirectUri();
    const waiting = waitForPkceCallback({ expectedState: "expected-state", redirectUri, timeoutMs: 1_000 });
    const rejection = expect(waiting).rejects.toThrow("X authorization was denied or failed");

    const response = await requestWhenListening(
      `${redirectUri}?error=access_denied&state=expected-state&error_description=${encodeURIComponent(SECRET_TOKEN)}`
    );
    await rejection;
    expect(response.status).toBe(400);
    expect(response.body).not.toContain(SECRET_TOKEN);
    expect(response.body).not.toContain("expected-state");
    await assertPortReusable(redirectUri);
  });

  it("times out and closes the listener", async () => {
    const redirectUri = await freeRedirectUri();
    await expect(waitForPkceCallback({ expectedState: "expected-state", redirectUri, timeoutMs: 20 })).rejects.toThrow(/timed out/i);
    await assertPortReusable(redirectUri);
  });
});

describe("exchangePkceCode", () => {
  it("uses only the fixed token endpoint and a public-client PKCE form request", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return json({ access_token: "safe-access-token" });
    }) as typeof globalThis.fetch;
    const redirectUri = "http://127.0.0.1:8787/callback";

    await expect(exchangePkceCode({
      clientId: "public-client-id",
      redirectUri,
      code: SECRET_CODE,
      codeVerifier: "safe-code-verifier",
      fetch
    })).resolves.toBe("safe-access-token");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.x.com/2/oauth2/token");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.redirect).toBe("error");
    expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(new Headers(calls[0]?.init?.headers).get("accept")).toBe("application/json");
    expect([...new URLSearchParams(String(calls[0]?.init?.body)).entries()]).toEqual([
      ["client_id", "public-client-id"],
      ["grant_type", "authorization_code"],
      ["code", SECRET_CODE],
      ["redirect_uri", redirectUri],
      ["code_verifier", "safe-code-verifier"]
    ]);
    expect(String(calls[0]?.init?.body)).not.toContain("client_secret");
  });

  it("rejects redirects, status failures, and malformed token bodies without leaking codes or tokens", async () => {
    const redirectCalls: Array<{ init?: RequestInit }> = [];
    const redirectingFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      redirectCalls.push({ init });
      throw new Error(`redirected with ${SECRET_CODE}`);
    }) as typeof globalThis.fetch;

    let redirectMessage = "";
    try {
      await exchangePkceCode({
        clientId: "public-client-id", redirectUri: X_OAUTH_REDIRECT_URI, code: SECRET_CODE, codeVerifier: "verifier", fetch: redirectingFetch
      });
    } catch (error) {
      redirectMessage = error instanceof Error ? error.message : String(error);
    }
    expect(redirectCalls[0]?.init?.redirect).toBe("error");
    expect(redirectMessage).toBe("X token exchange request failed");
    expect(redirectMessage).not.toContain(SECRET_CODE);

    const failures = [
      { response: json({ detail: SECRET_TOKEN }, 403), expected: "X token exchange failed with status 403" },
      { response: json({ access_token: "  " }), expected: "Invalid X token response" },
      { response: new Response("not-json", { status: 200 }), expected: "Invalid X token response" }
    ];
    for (const failure of failures) {
      const fetch = (async () => failure.response) as typeof globalThis.fetch;
      let message = "";
      try {
        await exchangePkceCode({
          clientId: "public-client-id", redirectUri: X_OAUTH_REDIRECT_URI, code: SECRET_CODE, codeVerifier: "verifier", fetch
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toBe(failure.expected);
      expect(message).not.toContain(SECRET_CODE);
      expect(message).not.toContain(SECRET_TOKEN);
    }
  });

  it("rejects a redirect URI outside the loopback boundary before fetch", async () => {
    let called = false;
    const fetch = (async () => { called = true; return json({ access_token: "safe" }); }) as typeof globalThis.fetch;
    await expect(exchangePkceCode({
      clientId: "public-client-id", redirectUri: "https://example.com/callback", code: SECRET_CODE, codeVerifier: "verifier", fetch
    })).rejects.toThrow(/loopback redirect/i);
    expect(called).toBe(false);
  });
});
