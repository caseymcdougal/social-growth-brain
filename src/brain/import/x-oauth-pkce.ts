import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Socket } from "node:net";

export const X_OAUTH_REDIRECT_URI = "http://127.0.0.1:8787/callback";

const X_AUTHORIZATION_ENDPOINT = "https://x.com/i/oauth2/authorize";
const X_TOKEN_ENDPOINT = "https://api.x.com/2/oauth2/token";
const X_READ_ONLY_SCOPE = "tweet.read users.read";
const DEFAULT_CALLBACK_TIMEOUT_MS = 5 * 60 * 1_000;

type LoopbackRedirect = { redirectUri: string; port: number };
type CallbackOutcome =
  | { kind: "success"; code: string }
  | { kind: "denied"; status: number; responseBody: string; errorMessage: string }
  | { kind: "retry"; status: number; responseBody: string };

function invalidRedirectUri(): never {
  throw new Error("X OAuth loopback redirect URI must be an exact callback URL");
}

function nonblank(value: unknown, errorMessage: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(errorMessage);
  return value.trim();
}

function parseLoopbackRedirectUri(value: string | undefined): LoopbackRedirect {
  const redirectUri = value ?? X_OAUTH_REDIRECT_URI;
  if (typeof redirectUri !== "string") return invalidRedirectUri();

  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return invalidRedirectUri();
  }

  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname !== "/callback" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    redirectUri.includes("?") ||
    redirectUri.includes("#") ||
    !/^[1-9]\d{0,4}$/.test(url.port) ||
    Number(url.port) > 65_535 ||
    url.toString() !== redirectUri
  ) {
    return invalidRedirectUri();
  }

  return { redirectUri, port: Number(url.port) };
}

function secureBase64Url(randomBytesImpl: typeof randomBytes, size: number): string {
  let bytes: Buffer;
  try {
    bytes = randomBytesImpl(size);
  } catch {
    throw new Error("Unable to generate X OAuth PKCE values");
  }
  if (!Buffer.isBuffer(bytes) || bytes.length !== size) throw new Error("Unable to generate X OAuth PKCE values");
  return bytes.toString("base64url");
}

function safeStateMatch(expectedState: string, receivedState: string): boolean {
  const expected = Buffer.from(expectedState, "utf8");
  const received = Buffer.from(receivedState, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function closeQuietly(server: Server, sockets: Set<Socket>): Promise<void> {
  return new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
    try {
      server.closeAllConnections();
    } catch {
      // A listener that failed before binding has no HTTP connections to close.
    }
    for (const socket of sockets) socket.destroy();
  });
}

function respond(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    connection: "close",
    "content-type": "text/plain; charset=utf-8"
  });
  response.end(body);
}

function callbackOutcome(request: IncomingMessage, expectedState: string, redirectUri: string): CallbackOutcome {
  if (request.method !== "GET") {
    return { kind: "retry", status: 405, responseBody: "Method not allowed.\n" };
  }

  const requestTarget = request.url;
  if (!requestTarget || !requestTarget.startsWith("/") || requestTarget.startsWith("//") || requestTarget.includes("#")) {
    return { kind: "retry", status: 404, responseBody: "Not found.\n" };
  }
  const rawPathname = requestTarget.slice(0, requestTarget.indexOf("?") === -1 ? requestTarget.length : requestTarget.indexOf("?"));
  if (rawPathname !== "/callback") {
    return { kind: "retry", status: 404, responseBody: "Not found.\n" };
  }

  let callbackUrl: URL;
  let configuredUrl: URL;
  try {
    callbackUrl = new URL(requestTarget, redirectUri);
    configuredUrl = new URL(redirectUri);
  } catch {
    return { kind: "retry", status: 400, responseBody: "Invalid authorization callback.\n" };
  }
  if (callbackUrl.origin !== configuredUrl.origin || callbackUrl.pathname !== "/callback") {
    return { kind: "retry", status: 404, responseBody: "Not found.\n" };
  }

  const states = callbackUrl.searchParams.getAll("state");
  const matchingState = states.length === 1 && Boolean(states[0]) && safeStateMatch(expectedState, states[0]!);
  const errors = callbackUrl.searchParams.getAll("error");
  const codes = callbackUrl.searchParams.getAll("code");
  if (errors.length > 0) {
    if (matchingState && errors.length === 1 && errors[0]?.trim() && codes.length === 0) {
      return { kind: "denied", status: 400, responseBody: "Authorization was not completed.\n", errorMessage: "X authorization was denied or failed" };
    }
    return { kind: "retry", status: 400, responseBody: "Authorization could not be verified.\n" };
  }
  if (!matchingState) {
    return { kind: "retry", status: 400, responseBody: "Authorization could not be verified.\n" };
  }
  if (codes.length !== 1 || !codes[0]?.trim()) {
    return { kind: "retry", status: 400, responseBody: "Invalid authorization callback.\n" };
  }

  return { kind: "success", code: codes[0] };
}

/** Creates a read-only public-client Authorization Code + PKCE authorization request. */
export function createPkceAuthorization(input: {
  clientId: string;
  redirectUri?: string;
  randomBytes?: typeof randomBytes;
}): { authorizationUrl: URL; state: string; codeVerifier: string } {
  const clientId = nonblank(input.clientId, "A nonblank X OAuth client ID is required");
  const { redirectUri } = parseLoopbackRedirectUri(input.redirectUri);
  const randomBytesImpl = input.randomBytes ?? randomBytes;
  const state = secureBase64Url(randomBytesImpl, 32);
  const codeVerifier = secureBase64Url(randomBytesImpl, 64);
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const authorizationUrl = new URL(X_AUTHORIZATION_ENDPOINT);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("scope", X_READ_ONLY_SCOPE);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  return { authorizationUrl, state, codeVerifier };
}

/** Waits for exactly one read-only X OAuth callback on the fixed loopback listener. */
export async function waitForPkceCallback(input: {
  expectedState: string;
  redirectUri?: string;
  timeoutMs?: number;
}): Promise<string> {
  const expectedState = nonblank(input.expectedState, "A nonblank X OAuth state is required");
  const { redirectUri, port } = parseLoopbackRedirectUri(input.redirectUri);
  const timeoutMs = input.timeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("X OAuth callback timeout must be a positive integer");

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    const sockets = new Set<Socket>();
    const server = createServer((request, response) => {
      if (settled) {
        respond(response, 503, "Authorization listener is closed.\n");
        return;
      }
      const outcome = callbackOutcome(request, expectedState, redirectUri);
      if (outcome.kind === "success") {
        finishAfterResponse(response, 200, "Authorization received. You can return to the terminal.\n", undefined, outcome.code);
      } else if (outcome.kind === "denied") {
        finishAfterResponse(response, outcome.status, outcome.responseBody, new Error(outcome.errorMessage));
      } else {
        respond(response, outcome.status, outcome.responseBody);
      }
    });

    const finish = (error?: Error, code?: string): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      void closeQuietly(server, sockets).then(() => {
        if (error) reject(error);
        else resolve(code!);
      });
    };

    const finishAfterResponse = (response: ServerResponse, status: number, body: string, error?: Error, code?: string): void => {
      let responseFinished = false;
      const complete = (): void => {
        if (responseFinished) return;
        responseFinished = true;
        response.off("finish", complete);
        response.off("close", complete);
        response.off("error", complete);
        finish(error, code);
      };
      response.once("finish", complete);
      response.once("close", complete);
      response.once("error", complete);
      respond(response, status, body);
    };

    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    server.on("error", () => finish(new Error("Unable to start local X OAuth callback listener")));
    server.listen(port, "127.0.0.1", () => {
      if (settled) return;
      timeout = setTimeout(() => finish(new Error("X OAuth callback timed out")), timeoutMs);
    });
  });
}

/** Exchanges a PKCE code through the fixed official X token endpoint without a client secret. */
export async function exchangePkceCode(input: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  fetch?: typeof fetch;
}): Promise<string> {
  const clientId = nonblank(input.clientId, "A nonblank X OAuth client ID is required");
  const { redirectUri } = parseLoopbackRedirectUri(input.redirectUri);
  const code = nonblank(input.code, "A nonblank OAuth authorization code is required");
  const codeVerifier = nonblank(input.codeVerifier, "A nonblank OAuth code verifier is required");
  const fetchImpl = input.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("X token exchange is unavailable");

  let response: Response;
  try {
    response = await fetchImpl(X_TOKEN_ENDPOINT, {
      method: "POST",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      }).toString()
    });
  } catch {
    throw new Error("X token exchange request failed");
  }

  if (!response || typeof response.ok !== "boolean" || typeof response.status !== "number") {
    throw new Error("X token exchange request failed");
  }
  if (!response.ok) throw new Error(`X token exchange failed with status ${response.status}`);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Invalid X token response");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("Invalid X token response");
  const accessToken = (payload as Record<string, unknown>).access_token;
  if (typeof accessToken !== "string" || accessToken.trim() === "") throw new Error("Invalid X token response");
  return accessToken.trim();
}
