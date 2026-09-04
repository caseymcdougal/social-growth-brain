import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { CreatorArchive } from "../domain/creator-archive";
import { DEFAULT_OWNED_X_ARCHIVE_PATH, writeLocalCreatorArchive } from "./local-creator-archive";
import { OWNED_X_IMPORT_BUDGET_CENTS, fetchOwnedXCreatorArchive } from "./x-owned-posts-client";
import {
  X_OAUTH_REDIRECT_URI,
  createPkceAuthorization,
  exchangePkceCode,
  waitForPkceCallback
} from "./x-oauth-pkce";

type TextWriter = { write(text: string): unknown };
type Environment = Readonly<Record<string, string | undefined>>;
type MutableEnvironment = Record<string, string | undefined>;

const USAGE = "Usage: npm run brain:import:x-owned";
const MISSING_CLIENT_ID = "SOCIAL_BRAIN_X_OAUTH_CLIENT_ID must be set to a nonblank public OAuth client ID";
const X_OAUTH_CLIENT_ID_ENV = "SOCIAL_BRAIN_X_OAUTH_CLIENT_ID";
const REPOSITORY_ENV_PATH = resolve(".env");

export interface OwnedXPostsImportCliInput {
  args?: readonly string[];
  env?: Environment;
  stdout?: TextWriter;
  stderr?: TextWriter;
  authorize?: typeof createPkceAuthorization;
  waitForCode?: typeof waitForPkceCallback;
  exchangeCode?: typeof exchangePkceCode;
  readArchive?: typeof fetchOwnedXCreatorArchive;
  writeArchive?: (path: string, archive: CreatorArchive) => CreatorArchive;
}

export interface OwnedXPostsEnvFileInput {
  env?: MutableEnvironment;
  envPath?: string;
  readFile?: (path: string) => string;
}

function envFileClientId(contents: string): string | undefined {
  let clientId: string | undefined;
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?SOCIAL_BRAIN_X_OAUTH_CLIENT_ID\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const rawValue = match[1]!.trim();
    if (!rawValue) {
      clientId = "";
      continue;
    }
    const quote = rawValue[0];
    if (quote === "\"" || quote === "'") {
      const closingQuote = rawValue.indexOf(quote, 1);
      if (closingQuote === -1 || !/^\s*(?:#.*)?$/.test(rawValue.slice(closingQuote + 1))) {
        throw new Error("Invalid OAuth client ID entry in repository .env");
      }
      clientId = rawValue.slice(1, closingQuote);
      continue;
    }
    clientId = rawValue.slice(0, rawValue.indexOf("#") === -1 ? rawValue.length : rawValue.indexOf("#")).trim();
  }
  return clientId;
}

/** Loads only the nonsecret X OAuth client ID, without importing unrelated .env values. */
export function loadOwnedXPostsEnvFile(input: OwnedXPostsEnvFileInput = {}): void {
  const env = input.env ?? process.env;
  if (Object.prototype.hasOwnProperty.call(env, X_OAUTH_CLIENT_ID_ENV)) return;
  const readFile = input.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  let contents: string;
  try {
    contents = readFile(input.envPath ?? REPOSITORY_ENV_PATH);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error("Unable to read repository .env for owned X import");
  }
  const clientId = envFileClientId(contents);
  if (clientId !== undefined) env[X_OAUTH_CLIENT_ID_ENV] = clientId;
}

function clientIdFromEnvironment(env: Environment): string {
  const value = env.SOCIAL_BRAIN_X_OAUTH_CLIENT_ID;
  if (typeof value !== "string" || value.trim() === "") throw new Error(MISSING_CLIENT_ID);
  return value.trim();
}

function fixedBudgetDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function parseOwnedXPostsImportArgs(args: readonly string[]): void {
  if (args.length !== 0) throw new Error(USAGE);
}

/** Runs the user-mediated, read-only owned-post import without persisting OAuth credentials. */
export async function runOwnedXPostsImportCli(input: OwnedXPostsImportCliInput = {}): Promise<void> {
  const args = input.args ?? process.argv.slice(2);
  parseOwnedXPostsImportArgs(args);
  const env = input.env ?? process.env;
  const clientId = clientIdFromEnvironment(env);
  const stdout = input.stdout ?? process.stdout;
  const stderr = input.stderr ?? process.stderr;
  const authorize = input.authorize ?? createPkceAuthorization;
  const waitForCode = input.waitForCode ?? waitForPkceCallback;
  const exchangeCode = input.exchangeCode ?? exchangePkceCode;
  const readArchive = input.readArchive ?? fetchOwnedXCreatorArchive;
  const writeArchive = input.writeArchive ?? writeLocalCreatorArchive;

  let authorizationUrl: URL | undefined;
  let state: string | undefined;
  let codeVerifier: string | undefined;
  let authorizationCode: string | undefined;
  let accessToken: string | undefined;
  try {
    stderr.write(`Read-only X import maximum request envelope: ${fixedBudgetDisplay(OWNED_X_IMPORT_BUDGET_CENTS)}.\n`);
    ({ authorizationUrl, state, codeVerifier } = authorize({ clientId, redirectUri: X_OAUTH_REDIRECT_URI }));
    if (!authorizationUrl || !state || !codeVerifier) throw new Error("Unable to create X OAuth authorization request");
    stderr.write(`Open this read-only X authorization URL in your browser:\n${authorizationUrl.toString()}\n`);
    authorizationUrl = undefined;

    authorizationCode = await waitForCode({ expectedState: state, redirectUri: X_OAUTH_REDIRECT_URI });
    accessToken = await exchangeCode({
      clientId,
      redirectUri: X_OAUTH_REDIRECT_URI,
      code: authorizationCode,
      codeVerifier
    });
    const archive = await readArchive({ accessToken });
    writeArchive(DEFAULT_OWNED_X_ARCHIVE_PATH, archive);
    stdout.write(`${archive.id}\n${archive.sourceFingerprint}\n${archive.importReport.importedPosts}\n`);
  } finally {
    authorizationUrl = undefined;
    state = undefined;
    codeVerifier = undefined;
    authorizationCode = undefined;
    accessToken = undefined;
  }
}

function directCliErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === USAGE || message === MISSING_CLIENT_ID) return message;
  return "Owned X import failed. No local archive was written.";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => {
    loadOwnedXPostsEnvFile();
    return runOwnedXPostsImportCli();
  }).catch((error: unknown) => {
    process.stderr.write(`${directCliErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
