# Owned X Post History Import Design

Date: 2026-09-03
Owner: Casey McDougal
Status: User-approved scope; pending written-spec review before implementation

## Goal

Make the installed local Social Growth Brain plugin useful with up to 25 of Casey's own X posts, fetched once through the official X API. The result is a local, read-only archive that an agent can inspect through MCP. This is not a live opportunity feed and it does not enable posting, automatic refreshes, or AI analysis of X content.

## Approved boundaries

- Fetch at most 25 original posts from the authenticated X account once.
- Use OAuth 2.0 Authorization Code with PKCE and only `tweet.read` and `users.read` scopes.
- Treat $0.05 as the maximum requested run budget. The X Developer Console spending limit remains the authoritative financial stop.
- Store Casey-owned post history locally and outside Git; never store or log an OAuth access token.
- Keep the three existing synthetic MCP opportunities available and explicitly labelled synthetic.
- Do not access third-party posts, publish, schedule a refresh, add `offline.access`, or send imported X content to an AI model.

## Chosen approach

Use the official REST API directly, not the legacy hosted-MCP URL and not browser scraping.

The one-time local importer will:

1. Start a loopback-only OAuth callback listener at a documented `127.0.0.1` URL.
2. Create a random state value and PKCE verifier/challenge, then present the official X authorization URL for Casey's user-mediated approval; the program never presses consent controls or reads browser content.
3. Exchange the returned code in memory, call `GET /2/users/me`, verify that its username is `caseymcdougal`, then call `GET /2/users/{id}/tweets` exactly once with `max_results=25` and `exclude=retweets,replies`.
4. Normalize the returned profile and posts into a `CreatorArchive`, record Casey's explicit consent basis, and atomically write it as a mode-`0600` JSON file under `data/social-brain/`.
5. Discard the token when the process exits, then run the local MCP server against that archive plus the existing synthetic replay data.

The imported archive is a personal source of truth. It must not alter the synthetic opportunities or be treated as proof that Social Brain's forecasts work.

## Why this approach

| Option | Result |
| --- | --- |
| Direct official X API with PKCE | Chosen. Minimal permissions, no extra local X MCP service, and an auditable two-request import. |
| Current hosted-MCP configuration | Rejected. The configured `https://api.x.com/mcp` endpoint is not the current official local XMCP deployment model and accepts a bearer token at an arbitrary configured URL. |
| Browser capture or fallback | Rejected. It conflicts with the approved API-only scope and the Social Brain architecture's no-scraping rule. |

## Local data and MCP contract

`CreatorArchive` gains a distinct `x-api-owned-posts` source and a matching explicit consent value. Its existing strict profile/post validation remains in force. The archive stores only the profile fields, original-post text, timestamps, public metrics, import timestamp, and a deterministic fingerprint needed for the local read-only history.

The normal local plugin launcher will load synthetic opportunities in memory as it does today. If a valid owned-history archive exists, it will additionally expose a read-only `get_creator_archive` MCP tool. That tool reports whether the archive is unavailable or available, labels its source, and returns only Casey's retained history. `get_system_health` will separately report local-history availability while all live capabilities remain denied.

No PostgreSQL database, cloud host, scheduler, or production Social Brain configuration is introduced for this import.

## OAuth and money safety

The importer needs an X Developer app's OAuth client ID and a loopback redirect URI registered in that app. A client ID is not an access token; the access token returned after consent stays in process memory only. No X password, client secret, bearer token, refresh token, or API key will be requested from Casey or written to `.env`.

The importer will refuse a run if the requested post count exceeds 25, if its fixed $0.05 request envelope would be exceeded, or if a second timeline request would be needed. It will make no pagination requests. Since X pricing and account entitlements are controlled by X, the X Developer Console's account-level spend limit is the final cost control; the local $0.05 guard limits this program's request shape rather than claiming to read the account balance.

## Failure behavior

- A wrong OAuth state, missing authorization code, loopback callback from a non-loopback host, timeout, wrong authenticated handle, malformed API payload, API error, or invalid archive fails closed.
- No fallback to a browser, scraping, another X endpoint, a different user, or a retry with broader permissions is allowed.
- Error messages exclude tokens, authorization codes, raw request headers, and post text.
- Archive writes use a private temporary file and atomic rename. Symlinks and malformed archive files are rejected.
- A failed import leaves the prior valid archive untouched.

## Security cleanup tied to this work

The direct importer will not use `X_BEARER_TOKEN`, `X_MCP_SERVER_URL`, the hosted-MCP capture runner, or the browser fallback. Documentation will remove instructions that encourage those unsafe configurations. Before the OAuth flow is used, the production dependency audit must be rerun and any remaining high-severity production finding must be remediated and tested.

## Validation

Automated tests must cover:

- PKCE state generation/verification, loopback-only redirect validation, timeout cleanup, and a token-free error path.
- Exact X endpoints, exact read-only scopes, no pagination, a maximum of 25 posts, original-post filtering, and authenticated-handle verification using a mocked `fetch`.
- Strict archive normalization, deterministic fingerprinting, private atomic persistence, refusal of symlink/malformed inputs, and preservation of a prior archive on failure.
- MCP output with both synthetic opportunities and the optional owned archive, with every live capability still denied.
- Plugin manifest/launcher validation, full TypeScript build, focused tests, and the complete test suite.

## Explicitly out of scope

- AI judgment, AI generation, training, or fine-tuning on X content.
- Social Brain production mode, a database migration, cloud hosting, proof tracking, a live feed, or a recurring refresh.
- X writes, reply/quote/original post publishing, draft approval, or scheduled actions.
- Third-party X data and browser automation/scraping.

## Activation checklist after implementation

1. Casey opens the X Developer app consent page once and approves only the two read scopes.
2. The importer retrieves and saves no more than 25 owned original posts.
3. The agent verifies the local MCP tool labels the archive as `x-api-owned-posts` and still denies live capabilities.
4. The plugin cachebuster is updated and the local plugin is reinstalled so a new Codex task can use the updated tool.
