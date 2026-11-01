# Remote MCP connector (claude.ai)

How to add Cadence as a **custom connector** in claude.ai (web, Desktop, mobile) at a public URL such as `https://cadence.nicolab.ch/mcp`, published through a Cloudflare Tunnel, while the web app, `/api/*` and `/api/v1/sync` stay on Tailscale or the LAN.

**Related:** [MCP Integration](14-mcp-integration.md), [User Management](08-user-management.md), [Two-factor sign-in](29-two-factor-sign-in.md)

---

## Design: four locks

1. **Only the connector paths are public.** The tunnel forwards `/mcp`, the OAuth endpoints and their discovery documents; every other path answers `404` at the edge.
2. **Machine paths only from Anthropic.** A Cloudflare WAF rule blocks `/mcp`, `/oauth/token`, `/oauth/register` and the discovery documents unless the request comes from Anthropic's published egress range.
3. **The sign-in page behind Cloudflare Access.** `/oauth/authorize` opens in your own browser, so it is behind an Access application (email one-time code for your address).
4. **Cadence itself checks everything again.** Clients may only use the claude.ai callback, consent needs your Cadence password (and two-factor code when it is on), the token is bound to your account and only opens the MCP endpoint, it is revocable under Profile › API keys, and every registration, grant, token and MCP connection is logged.

Each lock holds on its own: a mistake in the Cloudflare setup still leaves Cadence asking for the password and code, and a stolen token still only reaches `/mcp`.

## What Claude requires

From Anthropic's connector documentation ([Authentication for connectors](https://claude.com/docs/connectors/building/authentication.md), [Lazy authentication](https://claude.com/docs/connectors/building/lazy-authentication.md), [IP addresses](https://platform.claude.com/docs/en/api/ip-addresses)):

| Requirement | How Cadence meets it |
|---|---|
| `401` with `WWW-Authenticate: Bearer resource_metadata="…"` on an unauthenticated MCP request | `POST /mcp` without a token answers `401` pointing at `<public URL>/.well-known/oauth-protected-resource/mcp` |
| Protected resource metadata (RFC 9728), `resource` equal to the URL entered in Claude | `/.well-known/oauth-protected-resource` and `…/mcp`: `resource` = `<public URL>/mcp`, `authorization_servers` = `[<public URL>]` |
| Authorization server metadata (RFC 8414) reachable from Anthropic | `/.well-known/oauth-authorization-server` |
| Client registration: DCR (RFC 7591) or CIMD | DCR at `/oauth/register`. CIMD is not advertised, so Claude uses DCR |
| Callback for the hosted apps | `https://claude.ai/api/mcp/auth_callback` (default allowlist, plus `https://claude.com/api/mcp/auth_callback`, which Anthropic says it may move to) |
| PKCE `S256` on every authorization request | Required; any other method is refused |
| Token endpoint takes `application/x-www-form-urlencoded`, answers in under 10 s | Yes |
| Refresh: `invalid_grant` for an invalid refresh token, rotation for public clients | No refresh tokens are issued (see [Tokens](#tokens)) |
| Outbound traffic from Anthropic | `160.79.104.0/21` (IPv4 only; the old `34.162.x.x` addresses are retired) |

Claude Code does not use this flow for a public connector: it sends a loopback redirect (`http://localhost:<port>/callback`), which the allowlist refuses. Keep using a `tt_` API key over Tailscale for Claude Code ([MCP Integration](14-mcp-integration.md)).

## How the flow works

1. claude.ai `POST /mcp` without a token → `401` with the metadata pointer.
2. claude.ai reads both metadata documents, then registers at `POST /oauth/register` with `redirect_uris: ["https://claude.ai/api/mcp/auth_callback"]`. Any other redirect URI is refused (`400 invalid_redirect_uri`). The `client_id` is signed with a key derived from `TUDUDI_SESSION_SECRET` and carries the client's name and redirect URIs, so no table is needed and nobody can forge or alter one.
3. Your browser opens `GET /oauth/authorize?…`. Cloudflare Access asks for the email code first. Cadence then checks the client, that the redirect URI is both registered by the client **and** still in the allowlist (an unknown client or redirect URI gets an error page, never a redirect), `response_type=code`, an `S256` challenge, and `resource` when sent.
4. The consent page names the app (as it calls itself) and the host you go back to, and asks for your Cadence email, password and, when two-factor sign-in is on, a current code (recovery codes are not accepted). **Allow** redirects to the callback with a one-minute, single-use code, the `state` and `iss`; **Deny** returns `access_denied`.
5. claude.ai's servers `POST /oauth/token` with the code, the redirect URI, the client id and the PKCE verifier. The code is spent on the first try whatever the outcome.

### Tokens

The access token is a regular Cadence API key named `Claude MCP (<client name>)`, with `abilities.scope = "mcp"`:

- it acts as your account only (the user who consented);
- it opens `/mcp`, `/api/mcp` and `/api/v1/mcp` only: any other `/api` path answers `403`, and CalDAV (Bearer or as a Basic password) refuses it like an unknown key. API key consumers only accept a scoped token when they name its scope (`findValidTokenByValue(value, { allowScopes })`);
- connecting the same client again (same name, e.g. `Claude`) revokes the previous token of that client;
- it expires after `TUDUDI_MCP_OAUTH_TOKEN_DAYS` days (default 30); claude.ai then asks you to connect again;
- **revoke it** under **Profile › API keys** (Revoke or Delete): the next MCP call gets `401`.

No refresh token is issued, so there is no long-lived second secret to rotate or leak.

### Audit log

Each step writes one structured line (stable message, `event` field, never a token, code, verifier or password):

| Message | `event` | Fields |
|---|---|---|
| `OAuth client registered` | `oauth.client_registered` | `clientName`, `redirectUris`, `ip` |
| `OAuth client registration refused` | `oauth.client_refused` | `error`, `ip` |
| `OAuth authorization granted` | `oauth.authorize_granted` | `userId`, `clientName`, `ip` |
| `OAuth authorization refused` | `oauth.authorize_refused` | `reason` (`invalid_credentials`, `mfa_required`, `mfa_invalid`, `email_not_verified`, `password_auth_disabled`), `userId` when known, `clientName`, `ip` |
| `OAuth authorization denied` | `oauth.authorize_denied` | `clientName`, `ip` |
| `OAuth token issued` | `oauth.token_issued` | `userId`, `tokenId`, `clientName`, `expiresAt`, `ip` |
| `OAuth token request refused` | `oauth.token_refused` | `error`, `ip` |
| `MCP session started` | `mcp.session_started` | `userId`, `tokenId`, `client` (from `clientInfo`), `ip`, `userAgent` |

The request log (pino-http) also records every request with its status, without the query string. On Unraid: `docker logs Cadence 2>&1 | grep -E '"event":"(oauth|mcp)\.'`.

### Rate limits

All `/oauth/*` endpoints and the authorization server metadata share a per-IP limiter that counts only failed requests (`RATE_LIMIT_AUTH_MAX` per `RATE_LIMIT_AUTH_WINDOW_MS`, 15 minutes by default). The consent form is also limited per submitted email, like the login form. `/mcp` has the same limiters as `/api` (failed bearer tokens per IP, authenticated requests per token).

## Cadence settings (Unraid container)

| Variable | Value | Why |
|---|---|---|
| `TUDUDI_PUBLIC_MCP_URL` | `https://cadence.nicolab.ch` | Turns the authorization server on; every URL in the metadata is built from it, never from `Host` or `X-Forwarded-Host`. Must be an `https` origin |
| `TUDUDI_MCP_OAUTH_REDIRECT_URIS` | leave unset | Default: `https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback`. Set it (comma-separated, exact match) to narrow it; clients registered for a removed URI stop working |
| `TUDUDI_MCP_OAUTH_TOKEN_DAYS` | `30` (default) | Token lifetime, 1 to 365 days |
| `TUDUDI_SESSION_SECRET` | already set, keep it | Signs the client ids; if it changes (or is unset, which makes a new one at each start), claude.ai has to connect again. Cadence logs an error at start when it is missing |
| `TUDUDI_TRUST_PROXY` | the cloudflared container's address or subnet, e.g. `172.17.0.0/16`, or keep the current value if a LAN proxy already needs one | So `req.ip` in the logs and limiters is the caller (`X-Forwarded-For` from cloudflared). Trusting a broad range lets LAN clients choose the IP that gets logged |
| `PASSWORD_AUTH_ENABLED` | unset or `true` | The consent page signs in with your password |

**Sign-up must stay closed.** Registration is off by default and stored in the database (`registration_enabled`). Check it from Tailscale:

```bash
curl -s http://<host>:3002/api/registration-status   # expect "enabled": false
```

If it says `true`, an admin turns it off with `POST /api/admin/toggle-registration` ([User Management](08-user-management.md)). The edge does not forward `/api/register` anyway. With OIDC on (`OIDC_ENABLED=true`), auto-provisioning creates accounts regardless of that switch; keep OIDC off or `OIDC_AUTO_PROVISION=false`.

Turn on two-factor sign-in for your account (Profile › Security) so the consent needs a code as well as the password.

Restart the container, then from Tailscale check `curl -s http://<host>:3002/.well-known/oauth-authorization-server` shows `https://cadence.nicolab.ch/...` URLs.

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

Locally managed tunnel (`config.yml`), above the existing rules:

```yaml
ingress:
  - hostname: cadence.nicolab.ch
    path: ^/(mcp|oauth/(authorize|token|register)|\.well-known/oauth-(protected-resource(/mcp)?|authorization-server))$
    service: http://<unraid-lan-ip>:3002
  - hostname: cadence.nicolab.ch
    service: http_status:404
  # ... existing rules ...
  - service: http_status:404
```

Validate with `cloudflared tunnel ingress validate` and test a path with `cloudflared tunnel ingress rule https://cadence.nicolab.ch/api/tasks` (must match the 404 rule).

Dashboard-managed tunnel (Zero Trust › Networks › Tunnels › your tunnel › Public hostname): add `cadence.nicolab.ch` with **Path** set to the same regular expression and service `HTTP` `<unraid-lan-ip>:3002`. Requests to any other path on that hostname fall through to the tunnel's catch-all `404`.

On a dashboard-managed tunnel, make sure no wildcard public hostname (e.g. `*.nicolab.ch`) comes after this rule: unmatched paths would reach that wildcard's service instead of the 404.

Keep **no** `cadence.nicolab.ch` DNS record other than the tunnel's CNAME, so nothing bypasses the tunnel.

### 2. WAF custom rule (lock 2)

Security › WAF › Custom rules › Create rule, action **Block**:

```
(http.host eq "cadence.nicolab.ch"
 and http.request.uri.path in {"/mcp" "/oauth/token" "/oauth/register" "/.well-known/oauth-protected-resource" "/.well-known/oauth-protected-resource/mcp" "/.well-known/oauth-authorization-server"}
 and not ip.src in {160.79.104.0/21})
```

Optional second rule, also **Block**, so only the expected methods get through:

```
(http.host eq "cadence.nicolab.ch"
 and ((http.request.uri.path eq "/mcp" and http.request.method ne "POST")
   or (http.request.uri.path in {"/oauth/token" "/oauth/register"} and http.request.method ne "POST")))
```

Optional third rule, **Block**, refusing percent-encoded paths on this host so only the literal paths above reach the tunnel:

```
(http.host eq "cadence.nicolab.ch" and raw.http.request.uri.path ne http.request.uri.path)
```

Claude's calls come from servers, not browsers: for `cadence.nicolab.ch`, keep **Bot Fight Mode**, **Block AI bots / AI Crawl Control** and **Browser Integrity Check** off, or skip them for this host with a configuration or skip rule. Otherwise `/mcp` and `/oauth/token` get a challenge and the connection never completes.

Re-check [Anthropic's IP page](https://platform.claude.com/docs/en/api/ip-addresses) from time to time; if the range changes the connector stops working (fail closed), it never opens up.

### 3. Cloudflare Access for the consent page (lock 3)

Zero Trust › Access › Applications › Add › Self-hosted:

- **Application domain:** `cadence.nicolab.ch`, **path** `oauth/authorize`. Only that path: claude.ai's servers call the other endpoints and cannot pass Access.
- **Session duration:** short, e.g. 15 minutes.
- **Policy:** Allow, Include › Emails › `coppens.n@gmail.com`
- **Login method:** One-time PIN (Settings › Authentication).

Do not enable "Bypass" or "Service auth" policies on this application.

### 4. Connect in claude.ai

Customize › Connectors › **Add custom connector** › URL `https://cadence.nicolab.ch/mcp`, leave the OAuth client ID and secret empty (Claude registers itself). Click **Connect**: the Access email code, then the Cadence consent page, then back to claude.ai.

Only approve the consent page right after clicking **Connect** yourself. If it opens from a link you did not start, click **Deny**.

## End-to-end checks

Run these from your own machine (not from Anthropic's range):

| # | Check | Expected |
|---|---|---|
| 1 | `curl -si -X POST https://cadence.nicolab.ch/mcp` | `403` (WAF block page) |
| 2 | `curl -si https://cadence.nicolab.ch/` and `/api/tasks`, `/api/v1/sync`, `/api/login`, `/login` | `404` from the tunnel |
| 3 | `curl -si https://cadence.nicolab.ch/oauth/token -d grant_type=x` | `403` (WAF) |
| 4 | `curl -si https://cadence.nicolab.ch/.well-known/oauth-authorization-server` | `403` (WAF) |
| 5 | Open `https://cadence.nicolab.ch/oauth/authorize` in a private window | Cloudflare Access login, not Cadence |
| 6 | After the Access code, the same URL without parameters | Cadence "Cannot connect" page (unknown client), no redirect |
| 7 | Connect from claude.ai with a wrong password | Consent page again with "Sign-in failed"; `oauth.authorize_refused` in the log |
| 8 | Connect with the right password and code | Back on claude.ai, connector shows tools; log has `oauth.client_registered`, `oauth.authorize_granted`, `oauth.token_issued`, `mcp.session_started` |
| 9 | Ask Claude to list today's tasks | Answers from your data; `Claude MCP (Claude)` appears under Profile › API keys with a recent "last used" |
| 10 | Revoke that key under Profile › API keys, ask again | claude.ai asks to reconnect |
| 11 | From Tailscale, use the Claude token on `/api/tasks` | `403 This token only grants MCP access` |
| 12 | From Tailscale: `curl -s -X POST http://<host>:3002/oauth/register -H 'Content-Type: application/json' -d '{"redirect_uris":["https://evil.example/cb"]}'` | `400 invalid_redirect_uri` |

## Residual risks

- **Cloudflare sees the traffic in clear** (TLS ends at its edge): tool calls and their results pass through Cloudflare.
- **Shared egress range:** `160.79.104.0/21` is all of Anthropic, so the WAF admits any Claude user's connector, not only yours. The authorization flow still needs your Access code, password and two-factor code; a stranger's connector only ever gets `401`.
- **Consent phishing:** someone could start a flow from their own claude.ai account and send you the authorize link. Access plus your password still apply; the defence is to approve only a flow you started.
- **Authorization codes are in memory**: a restart between consent and exchange means connecting again; several Cadence processes behind one hostname would need a shared store.
- **Token lifetime:** a leaked token works until it expires or is revoked, but only on `/mcp`, and only from Anthropic's range or your network.
