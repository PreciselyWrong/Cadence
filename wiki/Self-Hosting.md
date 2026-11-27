# Self-hosting

Cadence runs in a single Docker container, with a SQLite database by default: a personal machine is enough. This page is for the person who installs and maintains the server: startup, variables, database, backups, updates, hosted mode and Kubernetes. Sensitive values are written `<token>`: never copy them as they are.

## Start with Docker

Cadence keeps tududi's technical names (`CADENCE_*` variables, database files, the `tt_` prefix of API keys) so that existing installations keep working. Only the displayed name and the image (`ghcr.io/preciselywrong/cadence`) have changed.

```bash
docker run \
  -e CADENCE_USER_EMAIL=camille@example.com \
  -e CADENCE_USER_PASSWORD=<password> \
  -e CADENCE_SESSION_SECRET=<token> \
  -v ~/cadence/db:/app/db \
  -v ~/cadence/uploads:/app/uploads \
  -v ~/cadence/backups:/app/backups \
  -p 3002:3002 \
  -d ghcr.io/preciselywrong/cadence:latest
```

Open `http://localhost:3002` and sign in. `CADENCE_SESSION_SECRET` is generated with `openssl rand -hex 64`.

- `:latest` is built from `main`; each push also gets a `:sha-<short>` tag if you want to pin a version.
- Three folders must outlive the container: `/app/db` (the database), `/app/uploads` (attachments) and `/app/backups` (exports made from Profile › Backup & Restore).
- If your users open Cadence at an address other than `localhost` (for example `https://cadence.example.com`), add `BASE_URL`: the links in e-mails (account verification, forgotten password) depend on it.

### With docker-compose

The repository provides a `docker-compose.yml` that reads its configuration from a `.env` file:

```bash
cp .env.example .env
# edit .env, then:
docker-compose up -d
```

The `.env.example` file lists all the options, commented, with the link to the documentation of each one.

## Main variables

Only names are given; default values and details are in `.env.example`.

| Topic | Variables |
|---|---|
| Administrator account (created at first start if there is no user) | `CADENCE_USER_EMAIL`, `CADENCE_USER_PASSWORD` |
| Session | `CADENCE_SESSION_SECRET` (mandatory; also used to encrypt calendar, Apprise and webhook addresses, to be set before saving them) |
| Public address | `BASE_URL`, `CADENCE_ALLOWED_ORIGINS` |
| Behind a reverse proxy | `CADENCE_TRUST_PROXY`, `COOKIE_SECURE` |
| Files | `CADENCE_UPLOAD_PATH`, `FILE_UPLOAD_LIMIT_MB`, `PUID`, `PGID` (the owner of the mounted folders) |
| Database | `DATABASE_URL`, `DB_SSL`, `DB_POOL_MAX` |
| E-mail | `ENABLE_EMAIL`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_FROM_ADDRESS` and the SMTP credentials |
| Background jobs | `DISABLE_SCHEDULER`, `TELEGRAM_ENABLED`, `DISABLE_TELEGRAM` |
| Browser push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (generated on first use; only set to share a pair between several instances) |
| SSO sign-in | `OIDC_ENABLED`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` |
| Calendars | `CALDAV_ENABLED`, `CALDAV_ALLOW_PRIVATE_HOSTS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| AI (OpenAI-compatible provider) | `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` |

### Google Calendar and Tasks

Create a Google OAuth client (Calendar and Tasks APIs, redirect URI `https://<your Cadence>/api/google/oauth/callback`). On its consent screen, use `https://<your Cadence>` as the home page and `https://<your Cadence>/privacy` as the privacy policy: Cadence serves that page publicly, without sign-in. Then publish the app "In production": in "Testing" mode Google expires the connection after 7 days and you have to reconnect every week.

### Behind a reverse proxy

With Caddy, Nginx, Traefik or an ingress, set `CADENCE_TRUST_PROXY` so that Cadence reads the client's real address: `true` (a single proxy, the simplest), `1` (first hop only), `loopback` or a subnet. Put the public address in `CADENCE_ALLOWED_ORIGINS`. Without this setting, rate limiting writes a validation error in the logs.

### Private network

Apprise, webhooks, CalDAV and calendar feeds refuse local network addresses (link-local and cloud metadata addresses are always refused). For an Apprise server or an n8n on your network, add `CALDAV_ALLOW_PRIVATE_HOSTS=true`. See [Notifications-and-Reminders](Notifications-and-Reminders).

## SQLite or PostgreSQL

| | SQLite (default) | PostgreSQL |
|---|---|---|
| For whom | A personal or family instance | Multi-user or larger use |
| Choice | Nothing to do | Set `DATABASE_URL` (for example `postgres://<user>:<password>@db:5432/cadence`) |
| Storage | A file in `/app/db` | A PostgreSQL 14 or newer server; only `/app/uploads` (and `/app/backups`) must persist |
| First start | Schema created and migrated | Empty database accepted: the schema is created from the models |

A complete example with a built-in PostgreSQL service is provided (`docs/examples/docker-compose.postgres.yml`, to copy as `docker-compose.yml` next to your `.env`). For an external database (managed PostgreSQL, another machine), remove the `db` service and put `DATABASE_URL` in `.env`. A password containing special characters is encoded in the address (`@` becomes `%40`) or passed through `DB_PASSWORD`.

### Moving from SQLite to PostgreSQL: by export then import

**Never switch by pointing `DATABASE_URL` at PostgreSQL on top of a filled SQLite installation.** For safety the container refuses to start when PostgreSQL is chosen while a SQLite database containing data is present; `CADENCE_ALLOW_DIALECT_SWITCH=true` only forces an empty PostgreSQL, it transfers nothing. There is no direct transfer.

1. On the old instance, make a **backup**: Profile › Backup & Restore › **Create Backup Now**, then **Download**. For an administrator, it includes all the instance's accounts, with their password hashes: keep the file as carefully as the database.
2. Start the new instance on an **empty** PostgreSQL database, with its own folders, and sign in with the account created by `CADENCE_USER_EMAIL`.
3. Profile › Backup & Restore › **Import from File**, choose the file, then **Restore Backup**. The import merges: an item whose identifier already exists is skipped.
4. Check your data, then stop the old instance. Keep its `db` folder for a few days.

What the backup does not contain: API keys, shares and permissions, sessions. Recreate the keys (Profile › API Keys) and reconnect the clients (Android, Linux client).

## Backups

| Situation | What is done |
|---|---|
| SQLite, at each start | Consistent copy of the file next to the database (`db-backup-<timestamp>.sqlite3`), then migrations |
| Retention | Up to 4 copies for today, one per day over the last 7 days, the rest is deleted |
| A migration that rebuilds a table | Its own snapshot (`db-premigrate-<name>.sqlite3`), never deleted automatically |
| PostgreSQL | No file copy: use `pg_dump`, for example from a scheduled job (the `scripts/pg-backup.sh` script makes a compressed dump and keeps 14 days) |
| Per-account export | Profile › Backup & Restore, writes a `.json.gz` file in `/app/backups` |

To restore a SQLite copy: stop the container, delete the `-wal` and `-shm` files of the database, copy the chosen backup in place of the database file, restart. For PostgreSQL: `gunzip -c <file> | psql "$DATABASE_URL"` into an empty database.

The start-up copies live on the same disk as the database: they protect against a failed migration, not a disk failure. Regularly copy `db`, `uploads` and `backups` elsewhere (another machine, remote storage). Do not copy a SQLite file while Cadence is running without going through the backup script: a plain copy misses recent writes.

## Updates

1. Make a backup (see above).
2. Pull the new image and recreate the container: `docker-compose pull && docker-compose up -d`.
3. At start, Cadence copies the SQLite database then applies pending migrations before accepting requests. **If a migration fails, the container refuses to start** and the log names the migration: the start-up copy is then the state before the update; restore it and stay on the previous image.

- **Displayed version.** The number (for example "Cadence 2026.11.26") is at the bottom of the sidebar. It is a date (`YYYY.MM.DD`, followed by `.2`, `.3` for a second release the same day), specific to the server and the web.
- **What's new.** The changelog is `docs/fork/CHANGELOG.md`, one entry per production release, the most recent on top; the Android app has its own (`android/CHANGELOG.md`).
- **Old volume path.** Since version 1.2, the database mounts on `/app/db` and uploads on `/app/uploads` (and no longer under `/app/backend/`). If your compose file predates that, fix the paths: otherwise new data goes to an anonymous volume lost when the container is recreated. Cadence shows a warning at start while the old path is used.
- **PostgreSQL forgotten in `.env`.** A `DATABASE_URL` or `DB_DIALECT` variable left over from another application switches Cadence to PostgreSQL. Remove it to keep SQLite.

## TODO.md projects

For projects to follow `TODO.md` files (see [TODO-md-Projects](TODO-md-Projects)), mount a **dedicated** folder read-write and name it:

| Variable | Role |
|---|---|
| `CADENCE_TODO_ROOT` | Root folder in the container (for example `/app/todo-projects`); each subfolder that contains a `TODO.md` can be linked. Without this variable, the feature is disabled |
| `CADENCE_TODO_USER_EMAIL` | Account that owns the projects (by default the first administrator) |
| `CADENCE_TODO_REPOS` | Git repositories to follow, comma-separated (`cadence,notes`); each relies on `CADENCE_TODO_REPO_<NAME>_URL`, `_BRANCH`, `_PATH` and an access (`_TOKEN` or `_SSH_KEY`, written `<token>`) |

**Never mount your working folder or a folder that contains secrets** (`.env` files, keys): the container could read everything. The `scripts/todo-md-sync.sh` script only copies the `TODO.md` files to the shared folder, in both directions, without pushing anything to git; it runs on the machine that holds your projects, not in the container, and Cadence notices a modified file within 30 seconds.

## claude.ai connector (remote MCP)

Cadence can be added as a custom connector of claude.ai at a public address such as `https://cadence.example.com/mcp`, while the application and the API stay on your private network.

- Variables: `CADENCE_PUBLIC_MCP_URL` (the public address; it enables the built-in authorization server), `CADENCE_MCP_OAUTH_ALLOWED_EMAILS` (accounts allowed to consent; otherwise administrators only), `CADENCE_MCP_OAUTH_TOKEN_DAYS` (token lifetime, 30 days by default) and `CADENCE_MCP_OAUTH_REDIRECT_URIS`.
- Only the connector's paths are public; the account must have two-factor sign-in, and a 10-minute pairing is started from Profile › MCP Integration › **Authorize a new connector**.
- The issued token only serves MCP: revoke it under Profile › API Keys.

The full procedure (tunnel, firewall rules, protected sign-in page) is in the documentation; see also [Integrations-MCP-and-Plugins](Integrations-MCP-and-Plugins).

## Hosted mode

Hosted mode (`CADENCE_HOSTED_MODE=true`) is for running Cadence as a public service where strangers sign up. **A personal installation never needs it**, and everything in it is inactive until the variable is set.

| What changes | Effect |
|---|---|
| First account registered | Ordinary user; the administrator comes from `CADENCE_USER_EMAIL` |
| Startup | Refused until the session secret, the proxy, the origins, the public addresses, e-mail and PostgreSQL are configured |
| Plans | Free, Pro and teams, with limits (tasks, projects, notes, attachments, AI) adjustable through `CADENCE_PLANS_JSON` |
| Trial | `CADENCE_TRIAL_DAYS` (7 by default, `0` to turn it off) starting from the e-mail verification |
| Webhooks, AI, MCP, CalDAV | Reserved for paid plans |

For a public multi-user instance, a separate compose example runs the interface and the background jobs (`DISABLE_SCHEDULER=true` and `DISABLE_TELEGRAM=true` on the web pods) in two services.

## Kubernetes

There is no Helm chart: `docs/examples/kubernetes/` provides manifests to copy (Deployment, Service, Ingress, two volumes, Secret) with the same image and the same variables as Docker.

```bash
cp -r docs/examples/kubernetes cadence-k8s && cd cadence-k8s
cp secret.example.yaml secret.yaml   # administrator and session secret
# replace the example address in ingress.yaml and deployment.yaml
kubectl apply -k .
```

| Point | What to know |
|---|---|
| Replicas | **Only one** with SQLite: background jobs run inside the application, two pods would send everything twice. Several web pods require PostgreSQL and the web/background jobs split |
| Storage | The database on a block disk (local-path, Longhorn, cloud disk), never on NFS or SMB (risk of corruption); with PostgreSQL, no database volume |
| Ingress | `CADENCE_TRUST_PROXY=1` for a simple controller; request body limit raised for attachments |
| Volume permissions | The image starts as administrator, fixes permissions then switches to user 1001; on an NFS export with `root_squash`, start directly as 1001 |
| Backups | Volume snapshot, or the export API from a scheduled job with an API key; do not copy the SQLite file while the pod is running |
| Updates | Pin an image tag and read the changelog before changing it |

## Going further

- [README (start, proxy, SSO, CalDAV, update)](https://github.com/PreciselyWrong/cadence/blob/main/README.md)
- [PostgreSQL](https://github.com/PreciselyWrong/cadence/blob/main/docs/16-postgresql.md)
- [Hosted mode](https://github.com/PreciselyWrong/cadence/blob/main/docs/17-hosted-mode.md)
- [Kubernetes](https://github.com/PreciselyWrong/cadence/blob/main/docs/22-kubernetes.md)
- [Backups and restore](https://github.com/PreciselyWrong/cadence/blob/main/docs/backups.md)
- [TODO.md projects, server side](https://github.com/PreciselyWrong/cadence/blob/main/docs/35-todo-md-projects.md)
- [claude.ai connector](https://github.com/PreciselyWrong/cadence/blob/main/docs/38-remote-mcp.md)
- [Changelog](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/CHANGELOG.md)
- Related pages: [Integrations-MCP-and-Plugins](Integrations-MCP-and-Plugins), [Notifications-and-Reminders](Notifications-and-Reminders), [Offline-and-Sync](Offline-and-Sync), [TODO-md-Projects](TODO-md-Projects)
