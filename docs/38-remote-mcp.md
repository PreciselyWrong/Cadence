# Remote MCP connector (claude.ai)

How to add Cadence as a **custom connector** in claude.ai (web, Desktop, mobile) at a public URL such as `https://cadence.example.com/mcp`, published through a Cloudflare Tunnel, while the web app, `/api/*` and `/api/v1/sync` stay on Tailscale or the LAN.

**Related:** [MCP Integration](14-mcp-integration.md), [User Management](08-user-management.md), [Two-factor sign-in](29-two-factor-sign-in.md)

---

## Design: five locks

1. **Only the connector paths are public.** The tunnel forwards `/mcp`, the OAuth endpoints and their discovery documents; every other path answers `404` at the edge.
2. **Machine paths only from Anthropic.** Cloudflare WAF rules block `/mcp`, `/oauth/token`, `/oauth/register` and the discovery documents unless the request comes from Anthropic's published egress range, and block any percent-encoded path on the host.
3. **The sign-in page behind Cloudflare Access.** `/oauth/authorize` opens in your own browser, so it is behind an Access application (email one-time code for your address).
4. **A pairing window.** Registration and consent are refused unless you clicked **Authorize a new connector** under Profile › MCP, in the web app over Tailscale, in the last 10 minutes. A pairing serves one client and closes once you grant it.
5. **Cadence itself checks everything again.** The public `/mcp` only accepts the MCP-only tokens Cadence issues to connectors (a full-access API key, a session cookie or an OIDC token is refused there); clients may only use the claude.ai callback; consent needs an allowed account (`TUDUDI_MCP_OAUTH_ALLOWED_EMAILS`, or admins), its password **and** a two-factor code, so an account without two-factor sign-in cannot connect anything; the token only opens the MCP endpoint and is revocable under Profile › API keys; every pairing, registration, grant, token and MCP connection is logged, and each grant sends you a security email.

Each lock holds on its own: a mistake in the Cloudflare setup still leaves Cadence asking for the pairing, the password and the code, and a stolen token still only reaches `/mcp`.

## What Claude requires

From Anthropic's connector documentation ([Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md), [Lazy authentication](https://claude.com/docs/connectors/building/lazy-authentication.md), [IP addresses](https://platform.claude.com/docs/en/api/ip-addresses)):

| Requirement | How Cadence meets it |
|---|---|
| `401` with `WWW-Authenticate: Bearer resource_metadata="…"` on an unauthenticated MCP request | `POST /mcp` without a connector token answers `401` pointing at `<public URL>/.well-known/oauth-protected-resource/mcp` |
| Protected resource metadata (RFC 9728), `resource` equal to the URL entered in Claude | `/.well-known/oauth-protected-resource` and `…/mcp`: `resource` = `<public URL>/mcp`, `authorization_servers` = `[<public URL>]` |
| Authorization server metadata (RFC 8414) reachable from Anthropic | `/.well-known/oauth-authorization-server` |
| Client registration: DCR (RFC 7591) or CIMD | DCR at `/oauth/register`, open only during a pairing. CIMD is not advertised, so Claude uses DCR |
| Callback for the hosted apps | `https://claude.ai/api/mcp/auth_callback` (default allowlist, plus `https://claude.com/api/mcp/auth_callback`, which Anthropic says it may move to) |
| PKCE `S256` on every authorization request | Required; any other method is refused |
| Token endpoint takes `application/x-www-form-urlencoded`, answers in under 10 s | Yes |
| Refresh: `invalid_grant` for an invalid refresh token, rotation for public clients | No refresh tokens are issued (see [Tokens](#tokens)) |
| Outbound traffic from Anthropic | `160.79.104.0/21` (IPv4 only; the old `34.162.x.x` addresses are retired) |

Claude Code does not use this flow for a public connector: it sends a loopback redirect (`http://localhost:<port>/callback`), which the allowlist refuses. Keep using a `tt_` API key over Tailscale for Claude Code ([MCP Integration](14-mcp-integration.md)); `/api/mcp` still accepts full-access keys, sessions and OIDC tokens.

## How the flow works

0. In the web app (over Tailscale), Profile › MCP › **Authorize a new connector** opens the pairing window for 10 minutes. Only a signed-in browser session can open it (not an API key), and only for an account allowed to consent that has two-factor sign-in on. Clicking again restarts the window and forgets the previous one.
1. claude.ai `POST /mcp` without a token → `401` with the metadata pointer.
2. claude.ai reads both metadata documents, then registers at `POST /oauth/register` with `redirect_uris: ["https://claude.ai/api/mcp/auth_callback"]`. Outside a pairing, or once the pairing already has its client, registration answers `403 access_denied`. Any other redirect URI is refused (`400 invalid_redirect_uri`). The `client_id` is signed with a key derived from `TUDUDI_SESSION_SECRET` and carries the client's name, redirect URIs and registration time, so no table is needed and nobody can forge or alter one.
3. Your browser opens `GET /oauth/authorize?…`. Cloudflare Access asks for the email code first. Cadence then checks the client, that the redirect URI is both registered by the client **and** still in the allowlist, and that the pairing is open for this client (an unknown client, a refused redirect URI or a closed pairing gets an error page, never a redirect); then `response_type=code`, an `S256` challenge, and `resource` when sent. A client registered earlier that connects again (token expired, connector re-added) can use a fresh pairing: the first client to open the consent page during a pairing becomes its one client.
4. The consent page names the app (as it calls itself, with control and bidi characters removed), **how long ago it registered** and the host you go back to, and asks for your Cadence email, password and a current two-factor code (recovery codes are not accepted). Only the account that opened the pairing can allow it. Every refusal shows the same "Sign-in failed" message, so the page never confirms a password; the log keeps the reason. **Allow** redirects to the callback with a one-minute, single-use code, the `state` and `iss`, closes the pairing, writes the grant to the audit log and emails you; **Deny** returns `access_denied`.
5. claude.ai's servers `POST /oauth/token` with the code, the redirect URI, the client id and the PKCE verifier. The code is spent on the first try whatever the outcome.

Approve only a consent page you started yourself a moment ago: a client that registered "less than a minute ago" is expected, one that registered hours ago on a fresh connection is not.

### Tokens

The access token is a regular Cadence API key named `Claude MCP (<client name>)`, with `abilities.scope = "mcp"` and the `client_id` it was issued to:

- it acts as your account only (the user who consented);
- it opens `/mcp`, `/api/mcp` and `/api/v1/mcp` only: any other `/api` path answers `403`, and CalDAV (Bearer or as a Basic password) refuses it like an unknown key. API key consumers only accept a scoped token when they name its scope (`findValidTokenByValue(value, { allowScopes })`);
- the public `/mcp` accepts nothing else: a full-access `tt_` key, a session cookie or an OIDC token gets `401` there;
- the same client connecting again (same signed `client_id`) revokes its previous token; a different client with the same name does not. Removing and re-adding the connector in claude.ai registers a new client, so the previous `Claude MCP (…)` key stays valid until it expires: revoke it under Profile › API keys (the security email of each grant is the reminder);
- it expires after `TUDUDI_MCP_OAUTH_TOKEN_DAYS` days (default 30); claude.ai then asks you to connect again, which needs a new pairing;
- **revoke it** under **Profile › API keys** (Revoke or Delete): the next MCP call gets `401`.

No refresh token is issued, so there is no long-lived second secret to rotate or leak.

Tokens do not depend on `TUDUDI_SESSION_SECRET`, but client ids do. If you change that secret, revoke the `Claude MCP (…)` keys under Profile › API keys: the old clients can no longer be read, and their tokens would otherwise stay valid until they expire.

### Audit log

Each grant is written to the auth audit log (`auth_audit_log`, `event_type = mcp_connector_granted`, `auth_method = mcp_oauth`, with the client name and registration time) and sends the security email "An assistant was connected to your account".

Each step also writes one structured line (stable message, `event` field, never a token, code, verifier or password):

| Message | `event` | Fields |
|---|---|---|
| `OAuth pairing opened` | `oauth.pairing_opened` | `userId`, `expiresAt`, `ip` |
| `OAuth client registered` | `oauth.client_registered` | `clientName`, `redirectUris`, `ip` |
| `OAuth client registration refused` | `oauth.client_refused` | `error` (`pairing_closed`, `invalid_redirect_uri`), `ip` |
| `OAuth authorization granted` | `oauth.authorize_granted` | `userId`, `clientName`, `ip` |
| `OAuth authorization refused` | `oauth.authorize_refused` | `reason` (`invalid_credentials`, `not_allowed`, `mfa_required`, `mfa_code_missing`, `mfa_invalid`, `pairing_other_user`, `email_not_verified`, `password_auth_disabled`), `userId` when known, `clientName`, `ip` |
| `OAuth authorization denied` | `oauth.authorize_denied` | `clientName`, `ip` |
| `OAuth token issued` | `oauth.token_issued` | `userId`, `tokenId`, `clientName`, `expiresAt`, `ip` |
| `OAuth token request refused` | `oauth.token_refused` | `error`, `ip` |
| `MCP session started` | `mcp.session_started` | `userId`, `tokenId`, `client` (from `clientInfo`), `ip`, `userAgent` |

The request log (pino-http) also records every request with its status, without the query string. On Unraid: `docker logs Cadence 2>&1 | grep -E '"event":"(oauth|mcp)\.'`.

### Rate limits

Anthropic's egress range is shared by every Claude user, so nothing on the machine paths counts per IP: otherwise anyone's failing connector could get yours a `429`.

| Path | Limit |
|---|---|
| Discovery documents (`/.well-known/…`) | none |
| `POST /oauth/register` | none: closed outside the pairing window, which costs nothing to refuse |
| `POST /oauth/token` | failed requests per `client_id` (`RATE_LIMIT_AUTH_MAX` per `RATE_LIMIT_AUTH_WINDOW_MS`, 5 per 15 minutes by default) |
| `GET`/`POST /oauth/authorize` (your browser) | failed requests per IP, as above, and refused sign-ins on the consent form per submitted email (`RATE_LIMIT_AUTH_EMAIL_MAX`, 10 per 15 minutes), on a counter of its own: failed consents never lock you out of the web sign-in, and requests for an unknown client or outside the pairing do not count |
| `POST /mcp` | failed bearer tokens per token prefix (`RATE_LIMIT_BEARER_FAILURE_MAX`, 50 per 15 minutes); requests per token (`RATE_LIMIT_AUTH_API_MAX`, 1000 per 15 minutes). A call without a token, the first step of every connection, is never counted |

## Cadence settings (Unraid container)

| Variable | Value | Why |
|---|---|---|
| `TUDUDI_PUBLIC_MCP_URL` | `https://cadence.example.com` | Turns the authorization server and the root `/mcp` on (both `404` without it); every URL in the metadata is built from it, never from `Host` or `X-Forwarded-Host`. Must be an `https` origin |
| `TUDUDI_MCP_OAUTH_ALLOWED_EMAILS` | `you@example.com` | Comma-separated accounts allowed to open a pairing and consent (case does not matter). Unset: admins only |
| `TUDUDI_MCP_OAUTH_REDIRECT_URIS` | leave unset | Default: `https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback`. Set it (comma-separated, exact match) to narrow it; clients registered for a removed URI stop working |
| `TUDUDI_MCP_OAUTH_TOKEN_DAYS` | `30` (default) | Token lifetime, 1 to 365 days |
| `TUDUDI_SESSION_SECRET` | already set, keep it | Signs the client ids; if it changes (or is unset, which makes a new one at each start), claude.ai has to connect again and the old `Claude MCP (…)` keys must be revoked by hand (see [Tokens](#tokens)). Cadence logs an error at start when it is missing |
| `TUDUDI_TRUST_PROXY` | the address cloudflared's requests come from, e.g. `172.17.0.1` (see below) | So `req.ip` in the logs, the audit log and the consent-page limiter is the caller (`X-Forwarded-For` from cloudflared) rather than cloudflared. Use that one address, not a hop count (`1`) or a broad range: every address you trust can choose the IP that gets logged |
| `PASSWORD_AUTH_ENABLED` | unset or `true` | The consent page signs in with your password |

**Finding the address for `TUDUDI_TRUST_PROXY`.** With the variable unset, open `https://cadence.example.com/oauth/authorize` after the Access code (check 6 below), then read the `remoteAddress` of that request in the request log (`docker logs Cadence 2>&1 | grep oauth/authorize | tail -1`). When cloudflared runs as a container on Unraid's default bridge and reaches Cadence at `<unraid-lan-ip>:3002`, that is usually the bridge gateway `172.17.0.1`; with both containers on a custom network, it is cloudflared's address on it (`docker inspect cloudflared --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`). If a LAN reverse proxy already needs `TUDUDI_TRUST_PROXY`, list both addresses, comma-separated.

**Sign-up must stay closed.** Registration is off by default and stored in the database (`registration_enabled`). Check it from Tailscale:

```bash
curl -s http://<host>:3002/api/registration-status   # expect "enabled": false
```

If it says `true`, an admin turns it off with `POST /api/admin/toggle-registration` ([User Management](08-user-management.md)). The edge does not forward `/api/register` anyway. With OIDC on (`OIDC_ENABLED=true`), auto-provisioning creates accounts regardless of that switch; keep OIDC off or `OIDC_AUTO_PROVISION=false`.

**Two-factor sign-in is required** for the account that connects: Profile › Security › turn on two-factor sign-in ([Two-factor sign-in](29-two-factor-sign-in.md)). Without it the pairing button and the consent page both refuse (`mfa_required`).

Restart the container, then from Tailscale check `curl -s http://<host>:3002/.well-known/oauth-authorization-server` shows `https://cadence.example.com/...` URLs.

## Cloudflare

### 1. Tunnel ingress (lock 1)

The public paths, all answered by Cadence at the root:

| Path | Method | Caller |
|---|---|---|
| `/mcp` | POST | Anthropic |
| `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/mcp` | GET | Anthropic |
| `/.well-known/oauth-authorization-server` | GET | Anthropic |
| `/oauth/register` | POST | Anthropic |
| `/oauth/token` | POST | Anthropic |
| `/oauth/authorize` | GET, POST | your browser |

Cadence answers `405` (with `Allow`) to any other method on `/mcp` and `/oauth/*`, never the web app.

Locally managed tunnel (`config.yml`), above the existing rules:

```yaml
ingress:
  - hostname: cadence.example.com
    path: ^/(mcp|oauth/(authorize|token|register)|\.well-known/oauth-(protected-resource(/mcp)?|authorization-server))$
    service: http://<unraid-lan-ip>:3002
  - hostname: cadence.example.com
    service: http_status:404
  # ... existing rules ...
  - service: http_status:404
```

Validate with `cloudflared tunnel ingress validate` and test a path with `cloudflared tunnel ingress rule https://cadence.example.com/api/tasks` (must match the 404 rule).

Dashboard-managed tunnel (Zero Trust › Networks › Tunnels › your tunnel › Public hostname): add `cadence.example.com` with **Path** set to the same regular expression and service `HTTP` `<unraid-lan-ip>:3002`. Requests to any other path on that hostname fall through to the tunnel's catch-all `404`.

On a dashboard-managed tunnel, make sure no wildcard public hostname (e.g. `*.example.com`) comes after this rule: unmatched paths would reach that wildcard's service instead of the 404.

Keep **no** `cadence.example.com` DNS record other than the tunnel's CNAME, so nothing bypasses the tunnel.

### 2. WAF custom rules (lock 2)

Security › WAF › Custom rules › Create rule. Rules 1 and 3 are required; rule 2 is optional (Cadence answers `405` anyway).

**Rule 1, Block — machine paths only from Anthropic:**

```
(http.host eq "cadence.example.com"
 and http.request.uri.path in {"/mcp" "/oauth/token" "/oauth/register" "/.well-known/oauth-protected-resource" "/.well-known/oauth-protected-resource/mcp" "/.well-known/oauth-authorization-server"}
 and not ip.src in {160.79.104.0/21})
```

**Rule 2 (optional), Block — only the expected methods:**

```
(http.host eq "cadence.example.com"
 and ((http.request.uri.path eq "/mcp" and http.request.method ne "POST")
   or (http.request.uri.path in {"/oauth/token" "/oauth/register"} and http.request.method ne "POST")))
```

**Rule 3, Block — no percent-encoded paths.** Rule 1 compares literal paths; an encoded one (`/oauth/%74oken`, `/oauth%2Fregister`) could otherwise reach the tunnel without matching it. Matching on `%` in the raw path works whatever Cloudflare's URL normalization settings are:

```
(http.host eq "cadence.example.com" and raw.http.request.uri.path contains "%")
```

Claude's calls come from servers, not browsers: for `cadence.example.com`, keep **Bot Fight Mode**, **Block AI bots / AI Crawl Control** and **Browser Integrity Check** off, or skip them for this host with a configuration or skip rule. Otherwise `/mcp` and `/oauth/token` get a challenge and the connection never completes.

Re-check [Anthropic's IP page](https://platform.claude.com/docs/en/api/ip-addresses) from time to time; if the range changes the connector stops working (fail closed), it never opens up.

### 3. Cloudflare Access for the consent page (lock 3)

Zero Trust › Access › Applications › Add › Self-hosted:

- **Application domain:** `cadence.example.com`, **path** `oauth/authorize`. Only that path: claude.ai's servers call the other endpoints and cannot pass Access.
- **Session duration:** short, e.g. 15 minutes.
- **Policy:** Allow, Include › Emails › `you@example.com`
- **Login method:** One-time PIN (Settings › Authentication).

Do not enable "Bypass" or "Service auth" policies on this application.

### 4. Pair, then connect in claude.ai (lock 4)

1. In Cadence over Tailscale: Profile › MCP › **Authorize a new connector**. The card shows the URL to add and until when Cadence waits.
2. Within those 10 minutes, in claude.ai: Customize › Connectors › **Add custom connector** › URL `https://cadence.example.com/mcp`, leave the OAuth client ID and secret empty (Claude registers itself). Click **Connect**: the Access email code, then the Cadence consent page (check the client registered "less than a minute ago"), then back to claude.ai.

To reconnect later (token expired or revoked), click **Authorize a new connector** again, then **Connect** in claude.ai.

Only approve the consent page right after clicking **Connect** yourself. If it opens from a link you did not start, click **Deny**.

## End-to-end checks

Run 1 to 6 from your own machine (not from Anthropic's range), the rest as described:

| # | Check | Expected |
|---|---|---|
| 1 | `curl -si -X POST https://cadence.example.com/mcp` | `403` (WAF block page) |
| 2 | `curl -si https://cadence.example.com/` and `/api/tasks`, `/api/v1/sync`, `/api/login`, `/login` | `404` from the tunnel |
| 3 | `curl -si https://cadence.example.com/oauth/token -d grant_type=x`, then `curl -si -X POST https://cadence.example.com/oauth/%72egister` and `curl -si -X POST https://cadence.example.com/oauth%2Fregister` | `403` each (WAF rule 1, then rule 3) |
| 4 | `curl -si https://cadence.example.com/.well-known/oauth-authorization-server` | `403` (WAF) |
| 5 | Open `https://cadence.example.com/oauth/authorize` in a private window | Cloudflare Access login, not Cadence |
| 6 | After the Access code, the same URL without parameters | Cadence "Cannot connect" page (unknown client), no redirect |
| 7 | Without clicking **Authorize a new connector**, Connect from claude.ai | claude.ai fails to register; log has `oauth.client_refused` with `error: pairing_closed` |
| 8 | Pair, Connect, wrong password (then: right password, wrong code) | Consent page again with "Sign-in failed"; `oauth.authorize_refused` (`invalid_credentials`, then `mfa_invalid`); your web sign-in still works |
| 9 | Pair, Connect with the right password and code | Back on claude.ai, connector shows tools; log has `oauth.pairing_opened`, `oauth.client_registered`, `oauth.authorize_granted`, `oauth.token_issued`, `mcp.session_started`; the security email arrives |
| 10 | Ask Claude to list today's tasks | Answers from your data; `Claude MCP (Claude)` appears under Profile › API keys with a recent "last used" |
| 11 | Resubmit the consent page from step 9 (browser Back, Allow) | "Cannot connect": the pairing closed with the grant |
| 12 | From Tailscale, use the Claude token on `/api/tasks` | `403 This token only grants MCP access` |
| 13 | From Tailscale, a full-access key on the root: `curl -si -X POST http://<host>:3002/mcp -H "Authorization: Bearer <full tt_ key>"` | `401` with `WWW-Authenticate: Bearer resource_metadata=…`; the same key on `/api/mcp` works |
| 14 | From Tailscale: `curl -si -X POST http://<host>:3002/oauth/register -H 'Content-Type: application/json' -d '{"redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}'` | `403 access_denied` (no pairing open) |
| 15 | Pair, then the same request with `https://evil.example/cb` | `400 invalid_redirect_uri` |
| 16 | From Tailscale: `curl -si http://<host>:3002/oauth/token` | `405`, `Allow: POST` |
| 17 | Revoke `Claude MCP (Claude)` under Profile › API keys, ask Claude again | claude.ai asks to reconnect |

## Residual risks

- **Cloudflare sees the traffic in clear** (TLS ends at its edge): tool calls and their results pass through Cloudflare.
- **Shared egress range:** `160.79.104.0/21` is all of Anthropic, so the WAF admits any Claude user's connector, not only yours. Outside a pairing a stranger cannot even register; inside one, the consent still needs your Access code, password and two-factor code, and a stranger's connector only ever gets `401` on `/mcp`.
- **A race inside the pairing window:** someone who registers in the 10 minutes before your claude.ai does takes the pairing; your Connect then fails. Their client still cannot get past the consent page; click **Authorize a new connector** again.
- **Consent phishing:** someone could start a flow from their own claude.ai account and send you the authorize link. Access, the pairing and your password still apply; the defence is to approve only a flow you started, from a client that registered moments ago.
- **Pairings and authorization codes are in memory**: a restart means clicking **Authorize a new connector** again; several Cadence processes behind one hostname would need a shared store.
- **Lockout by token prefix:** failed `/mcp` calls are counted per token prefix, the 12 characters shown under Profile › API keys. Someone who saw it and sends 50 bad tokens with that prefix from Anthropic's range gets your connector `429` for 15 minutes; they still cannot use it.
- **Token lifetime:** a leaked token works until it expires or is revoked, but only on `/mcp`, and only from Anthropic's range or your network.
