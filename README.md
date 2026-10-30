<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/wide-logo-light.png">
    <source media="(prefers-color-scheme: light)" srcset="public/wide-logo-dark.png">
    <img src="public/wide-logo-dark.png" alt="Cadence" width="400">
  </picture>
</p>

<h3 align="center">One personal system for tasks, projects, habits and notes</h3>

<p align="center">
  Self-hosted, on the web and on Android, working offline, with no AI required.<br>
  A fork of <a href="https://github.com/chrisvel/tududi">tududi</a> by Chris Veleris, under the MIT licence.
</p>

![Cadence, light mode](screenshots/all-light.png)

More screenshots are [below](#screenshots).

---

## What Cadence is

Cadence keeps tasks, projects, areas, habits, notes and quick capture in one place. You run the server yourself (Docker, SQLite or PostgreSQL) and reach it from your devices, for example through Tailscale. Nothing is sent to a third party unless you connect it yourself (Google Calendar, CalDAV, OIDC).

| Client                               | State                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------- |
| **Web** (installable PWA)            | Full app: every feature below                                               |
| **Android** ([`android/`](android/)) | Habits with their widgets, and tasks synced with the server, usable offline |
| **Linux desktop**                    | Planned (lightweight Tauri app); the web app covers it meanwhile            |

### Android app

Native Kotlin app (Jetpack Compose, Room, Glance widgets), merged from the former Cadence habits app.

- **Tasks, offline:** every task is kept on the phone and synced with the server through [`/api/v1/sync`](docs/30-offline-sync.md). Changes made offline are queued and sent when the server is reachable again; conflicts are merged field by field.
- **Connect with a QR code:** create an API key in the web app (Profile → API keys) and scan the QR code shown under it, or type the server address and key.
- **Widgets:** a _Today_ widget where a task is checked off in one tap, a _+ Task_ widget for quick capture, and the habit widgets.
- **Capture and reminders:** share text from any app into the inbox, and get due-time reminders with a _Complete_ action.
- **Habits:** kept on the phone for now; syncing them with the server is planned.

Build and install a debug APK with `cd android && ./dev.sh` (JDK 21). See [android/AGENTS.md](android/AGENTS.md).

## What Cadence adds to tududi

Cadence builds on [chrisvel/tududi](https://github.com/chrisvel/tududi) (last synced with upstream `f04288d`, v1.14.0) and brings the calendar and planning views closer to TickTick. Everything below is new or changed compared with upstream; the rest of the app works as in tududi. The full list, kept up to date, is in [docs/fork/FORK.md](docs/fork/FORK.md).

### Offline sync and mobile

|                         | Upstream                                   | Cadence                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline clients         | The PWA reads from cache and queues writes | A **sync API** (`/api/v1/sync`): snapshot, pull by cursor, idempotent push, hybrid logical clocks, field-by-field merge, conflict log. Used by the Android app. [Docs](docs/30-offline-sync.md) |
| Device setup            | Copy the API key by hand                   | A **QR code** under each new API key, scanned by the Android app                                                                                                                                |
| Moving a recurring task | Moves the whole series                     | Choose **this occurrence**, **this and the following ones**, or **the whole series**, from the calendar, Today or the task row                                                                  |

### Calendar

|                                         | Upstream                                                                    | This fork                                                                                                                                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Views                                   | Month, Week, Day                                                            | **Year** (heatmap), Month, Week, **N days** (2–7), Day, **Agenda**                                                                                                                                                                                       |
| Task blocks                             | Always a 1-hour block at midnight of the due day (the due time was ignored) | Drawn at the due time for the task's **estimate**, or from its start time to its due time; whole-day and multi-day tasks are **bars** in an all-day row                                                                                                  |
| Drag & drop                             | Move only                                                                   | Move (keeps the length), **resize** the bottom edge (sets the estimate or the due time, 15-minute steps, 5 min–12 h); on Today, drop a task or block on a 15-minute slot or the all-day row                                                              |
| Scheduling                              | —                                                                           | **Arrange tasks** panel: undated and overdue tasks, grouped by project, filtered by project/tag/priority, dragged onto a day or an hour                                                                                                                  |
| Recurring tasks                         | Only the next occurrence                                                    | **Every occurrence** in the shown month (faded, read-only)                                                                                                                                                                                               |
| View options                            | —                                                                           | Show completed, weekends, repeats, **habits**, **focus sessions**, **week numbers**, **mini calendar**, **public holidays** (country + region), **colour by** project / priority / tag, **visible hours** (hide night hours) — saved per user            |
| Habits                                  | Not on the calendar                                                         | Purple whole-day items on each day a habit asks for a check-in                                                                                                                                                                                           |
| Print                                   | —                                                                           | Prints only the shown view                                                                                                                                                                                                                               |
| Subscribe from Google / Apple / Outlook | Not possible                                                                | Secret **.ics feed** of your dated tasks (Profile → Calendars), address shown once, revocable                                                                                                                                                            |
| Google Calendar & Tasks                 | Read-only iCal feeds                                                        | **Two-way sync**: every Google calendar shown, hidden or edited from Cadence (create, move, resize, delete); dated tasks on a **"Cadence" calendar** in Google; **all tasks** with Google Tasks (one list per project). Changes follow within ~2 minutes |

### Appearance

|                     | Upstream                        | This fork                                                                                                                                                                                    |
| ------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interface density   | One look, every control visible | **Minimal** (default, calmer TickTick-style list) or **Dense** (upstream's look), chosen in Profile → Appearance and saved in `ui_settings.appearance.density`                               |
| Minimal row details | Fixed details on each row       | Choose and reorder the right-hand chips of a Minimal row (recurrence, comments, tags, project, priority flag, due date) in Profile → Appearance, saved in `ui_settings.appearance.rowFields` |

### Sidebar

|                   | Upstream                       | This fork                                                                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar (Minimal) | One long list of every section | Smart lists with counts (Today, Tomorrow, Next 7 days, Inbox), Projects and Tags with Areas as folders, and an icon rail with a More menu. Smart lists, rail placement and count badges can be customised in Profile → Sidebar. Dense keeps the upstream sidebar. [Docs](docs/32-sidebar.md) |

### Focus

|              | Upstream                  | This fork                                                                                                             |
| ------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Tomato timer | A countdown, nothing kept | Finished sessions (and early stops of 5 min or more) are **recorded**                                                 |
| Statistics   | —                         | Insights → Productivity → **Focus**: total time, sessions, most focused hour, minutes per day and per hour, top tasks |
| Calendar     | —                         | Focus sessions as orange blocks                                                                                       |

### Today

|          | Upstream | This fork                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planning | —        | Planning happens on Today: candidates on the left (round check completes, **+** or drag places), and on the right a **Planning** / **Calendar** switch (remembered per browser). The calendar toggle hides the panel. Drag the untimed tasks ("Today, no time yet") into order, saved with the plan; **Tomorrow** / **Next week** move a planned task's due date and take it off today's plan (Undo brings it back) |
| Days     | —        | **‹** / **›** move between days and **Today** returns, kept in the URL as `?date=` [Docs](docs/20-daily-plan.md)                                                                                                                                                                                                                                                                                                    |

### Review and decisions

|                 | Upstream                            | This fork                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision funnel | Someday tag and defer-until only    | **In view** (possibilities), **This week** (commitments) and **Later** (parked, with an optional **review date**) from the task pane or the row menu; none of them is a due date, none reaches Google. On Today, this week's tasks and tasks in view lead the suggestions. [Docs](docs/34-review.md)                                                          |
| Postponements   | Due date changes logged, never read | Due date changes are classified (pushed back, rescheduled, time changed, automatic) and unfinished plan days counted; a task pushed back 3 times in 30 days is listed, and the task pane shows its history. No badges, no score. [Docs](docs/34-review.md)                                                                                                    |
| Review          | —                                   | One page, `/review` (More menu): **To decide**, **Pushed back**, **Stalled projects**, **Later**, **Old**, **This week** with planned time against available time; one Decide menu per row; decisions saved one by one, so a review can stop and resume. **Help me choose** compares two tasks at a time, on Today and in the week. [Docs](docs/34-review.md) |

### Projects

|              | Upstream                | This fork                                                                                                                       |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Timeline     | Bars coloured by status | Also **colour by priority or tag**                                                                                              |
| Sub-projects | Flat list of projects   | **Sub-projects**, any depth; a sub-project takes its parent's area; listed on the parent page, indented in the list and sidebar |

### Tasks, tags and boards

|                         | Upstream                                                                  | This fork                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pinned tasks            | —                                                                         | **Pin** a task: it stays at the top of All tasks, project lists, Today and Upcoming                                                                                                                                                                                                                                                                                                                    |
| Round check             | Checkbox and status menu on each row                                      | A **round check** before each title, ringed by priority; one click completes the task (undo toast) and it leaves the list. In Minimal, rows are one line with a priority flag and due date you can set in place. Task and Upcoming lists open on **open** tasks; "All" is explicit. [Docs](docs/00-tasks-behavior.md)                                                                                  |
| Task pane               | Inline quick-edit on the row                                              | In Minimal, a row click opens the task in a **right-hand pane** and you edit it in place (title, check, priority, due date, project, tags, note, subtasks); the URL keeps `?task=<uid>`, Escape closes it. Dense keeps the inline expansion. [Docs](docs/00-tasks-behavior.md)                                                                                                                         |
| Row gestures            | Subtasks through a list icon; no row menu; no keyboard moves between rows | In Minimal, a **chevron** before the check opens a row's subtasks, and group headers in project and day lists collapse. **Right-click** a row for priority, date (today, tomorrow, next week, clear), project, pin and delete. Arrow keys move between rows; Space completes, Enter opens, **D** and **P** open the date and priority pickers. Dense keeps upstream. [Docs](docs/00-tasks-behavior.md) |
| Drag to reorder         | —                                                                         | In Minimal, drag a row in the Tasks, project or tag list to set its order; it is saved per account and list and the list sorts by **Custom**. Drop a row on a project in the sidebar to move it there (the project lights up while you hover). [Docs](docs/00-tasks-behavior.md)                                                                                                                       |
| Add and completed       | Add box at the top of the page; completed tasks mixed into the list       | In Minimal, Today, Tasks, project and tag lists start with a **+ Add task** field (Enter adds to that list) and end with a collapsed **Completed (N)** section. Dense keeps upstream. [Docs](docs/00-tasks-behavior.md)                                                                                                                                                                                |
| Tags                    | Flat list                                                                 | **Nested tags** (one level of tag folders); a parent tag also matches its children in task/note filters, search, saved views and Focus                                                                                                                                                                                                                                                                 |
| Quick add               | English dates only                                                        | **French dates** too (`demain 15h`, `après-demain`, `le 12`, `d'ici vendredi`), **`!1`–`!3`** sets priority (high, medium, low), and **`^list`** is an alias of `+project`, matched without regard to case or accents. [Docs](docs/04-inbox-page.md)                                                                                                                                                   |
| Project board           | Kanban by status only                                                     | **Board** tab with free **sections** per project: add, rename, delete columns, drag columns and cards (order kept); read-only viewers can't edit                                                                                                                                                                                                                                                       |
| New view                | Views created from Universal Search only                                  | **New view** in the Minimal sidebar's Views section: name, project, tag, priority, due (today, next 7 days, overdue, no date) and status (open or done); a view can be narrowed to one project (`views.project_uid`). [Docs](docs/08-views-system.md)                                                                                                                                                  |
| List, board or calendar | One list per view                                                         | In Minimal, a saved view, tag page, project and the Tasks list switch between **List**, **Board** (columns by priority, drag to change it) and **Calendar** (a month by due date, drag to move it); the choice is remembered per view in `ui_settings.viewTypes`. Dense is unchanged. [Docs](docs/08-views-system.md)                                                                                  |
| Eisenhower matrix       | One fixed urgent/important matrix                                         | Up to 10 **custom matrices** with editable rules per quadrant (priority, due window, tags, projects); dragging a task edits its priority/tag to fit                                                                                                                                                                                                                                                    |
| Period summary          | —                                                                         | Insights → **Summary**: tasks completed in a period (plus open ones due in it), grouped by project/day/status, exported as Markdown, .txt, .csv or printed; saved as a template                                                                                                                                                                                                                        |

### Under the hood

- Manual order of lists: the existing `user_task_orders` table gains a `tag:<id>` scope next to `all` and `project:<id>` (no new column); `GET` and `PUT /api/tasks/order` accept `scope=tag&tag_uid=`.
- New column: `views.project_uid` (migration `20261029170000-add-project-uid-to-views`); the view search reads it through the existing `project_uid` scope.
- New `ui_settings` key: `viewTypes` (a map of `view:<uid>`, `tag:<name>`, `project:<uid>`, `tasks` to `list`, `board` or `calendar`; at most 500 entries, sanitised in `updateUiSettings`).
- Review: new columns `tasks.in_view_at`, `tasks.week_of`, `tasks.review_on`, `tasks.reviewed_at`, `projects.reviewed_at` (migration `20261030110000-add-review-fields-to-tasks-and-projects`); new endpoints `GET /api/review`, `GET /api/review/:category`, `GET /api/review/week`, `PUT /api/review/week/capacity`, `GET /api/task/:uid/postponements`, `POST /api/project/:uid/reviewed`; tasks accept `in_view`, `week_of`, `review_on`, `later` and `reviewed`; new `ui_settings.planning.weekCapacityMinutes`; rail item `review`. Due date events now compare stored values (a repeated save logs nothing) and record their source (`web`, `api`, `import`). The `review.*`, `postponements.*` and `thisOrThat.*` strings are agent-written and unreviewed in every language.
- New tables / columns: `google_accounts`, `google_calendars`, `google_events`, `google_tasklists`, `google_task_links`, `focus_sessions`, `project_sections`, `tasks.section_id`, `tasks.section_position`, `tasks.pinned_at`, `tags.parent_id`, `projects.parent_project_id`, `users.task_feed_token_hash` (SHA-256 only), with migrations.
- New endpoints: `/api/google*` (connect, settings, sync, calendars, events), `/api/feeds/tasks/:token.ics`, `/api/profile/task-feed`, `/api/holidays*`, `/api/focus-sessions*`, `/api/project/:uid/sections*` (incl. card order), `/api/project/:uid/unsectioned/order`, `/api/reports/summary`; tasks accept `pinned` and `section_uid`, tags accept `parent_uid`; `GET /api/tasks?type=calendar&end=` adds recurring and habit occurrences; `GET /api/tasks/smart-counts` returns the Today, Tomorrow and Next 7 days counts, and `GET /api/tasks?type=tomorrow` lists tomorrow.
- Minimal sidebar: `users.sidebar_settings` holds `smartLists` (show, count badge, order), `rail` (`rail` / `more` / `hidden` per item, in order) and `sectionBadges`; sanitized in `backend/modules/users/validation.js` on `PUT /api/profile/sidebar-settings`, defaults filled in by `frontend/utils/minimalSidebar.ts`.
- Minimal row chips: `ui_settings.appearance.rowFields` is an ordered `{ key, visible }` list, sanitized in `backend/modules/users/service.js` (known keys, boolean visibility, missing chips appended visible); see [08-user-management.md](docs/08-user-management.md).
- Habits offline sync: `recurring_completions` gains `uid` (unique, client-chosen or server-made) and `updated_at`; new table `idempotency_keys` (`user_id`, `key`, `method`, `path`, `request_hash`, `status`, `body`, `created_at`; unique on `user_id` + `key`, kept 24 hours; `backend/middleware/idempotency.js`). `POST /api/habits`, `/api/habits/:uid/complete` and `/skip` take an `Idempotency-Key` header; `POST /api/habits` and `/complete` take a `uid`; `GET /api/habits` and `GET /api/habits/:uid/completions` take `updated_since` and return `server_time`. MCP: `create_habit` takes `uid`, `log_habit_completion` takes `checkin_uid`. Docs: [Habits → Offline sync](docs/21-habits.md#offline-sync).
- Public holidays come from the [`date-holidays`](https://www.npmjs.com/package/date-holidays) package, on the server.
- All new strings are translated into the 26 languages (machine-written, review welcome). The strings for the round check and the gate-free Today (`dailyPlan.todayTasks`, `tasks.markAsNotDone`, and the `tasks.markAsDone` translations) are agent-written and unreviewed in every language. So are `tasks.addTaskInline` (the "+ Add task" field) and the `tasks.contextMenu.*` strings of the row menu, the `profile.taskRow*` strings (row chip names), and the `viewType.*` strings (List, Board, Calendar) and the `newView.*` strings. The Google sync strings are so far only in French, German, Spanish and Italian (English elsewhere).
- Working on the fork with an AI agent: see [AGENTS.md](AGENTS.md) and [docs/fork/FORK.md](docs/fork/FORK.md).
- Docs: [Daily plan & Calendar](docs/20-daily-plan.md), [Focus sessions](docs/30-focus-sessions.md), [Projects → Timeline & Board](docs/06-projects.md), [Tasks → Pinned](docs/00-tasks-behavior.md), [Nested tags](docs/09-tags-system.md), [Eisenhower views](docs/08-views-system.md), [Summary](docs/31-summary.md), [Google sync](docs/33-google-sync.md), [Review](docs/34-review.md).

---

## Features inherited from tududi

- **Tasks and subtasks:** filters (Today, Upcoming, Someday), sorting, progress on subtasks.
- **Recurring tasks:** daily, weekly, monthly (also on a weekday or the last day), every N days/weeks/months, from the due date or the completion date, with an optional end date. [Docs](docs/01-recurring-tasks-behavior.md)
- **Projects, areas, notes and tags**, goals and habits.
- **Families and small teams:** roles (admin, user, guest), groups, members without an email, assigning tasks to members or contacts. [Docs](docs/19-people-and-roles.md)
- **26 languages.**
- **Installable PWA** on Android, iOS and desktop.
- **REST API** with personal API keys and Swagger docs at `/api-docs`; **MCP server** for AI assistants. [Docs](docs/14-mcp-integration.md)
- **OIDC/SSO** sign-in (Google, Okta, Keycloak, Authentik, PocketID, Azure AD…) and **CalDAV** sync (tasks.org, Apple Reminders, Thunderbird, Nextcloud…).

## Getting started

Cadence keeps tududi's technical names so that existing installs keep working: the `TUDUDI_*` variables, the database files and the `tt_` API key prefix are unchanged. Only the displayed name and the image name (`ghcr.io/preciselywrong/cadence`) changed.

### Quick start

```bash
docker run \
  -e TUDUDI_USER_EMAIL=admin@example.com \
  -e TUDUDI_USER_PASSWORD=your-secure-password \
  -e TUDUDI_SESSION_SECRET=$(openssl rand -hex 64) \
  -v ~/cadence/db:/app/db \
  -v ~/cadence/uploads:/app/uploads \
  -v ~/cadence/backups:/app/backups \
  -p 3002:3002 \
  -d ghcr.io/preciselywrong/cadence:latest
```

`:latest` is built from `main`, and every push (any branch) also gets a `:sha-<short>` tag, by [`.github/workflows/custom-image.yml`](.github/workflows/custom-image.yml). Open [http://localhost:3002](http://localhost:3002) and sign in.

If people reach Cadence at another address (for example `http://unraid.local:3002` or `https://cadence.example.com`), add `-e BASE_URL=<that address>` so links in emails (account verification, password reset) point there instead of `localhost`.

### Using docker-compose

The repo also includes a `docker-compose.yml`. It pulls the Cadence image (`ghcr.io/preciselywrong/cadence:latest`). It reads its configuration from a `.env` file, so copy the example first:

```bash
cp .env.example .env
# edit .env with your values, then:
docker-compose up -d
```

### Reverse Proxy Setup

When running behind a reverse proxy (Caddy, Nginx, Traefik, etc.), set `TUDUDI_TRUST_PROXY` so that Express correctly reads client IPs from `X-Forwarded-For` headers. Without this, `express-rate-limit` will log a validation error.

```bash
docker run \
  -e TUDUDI_TRUST_PROXY=true \
  -e TUDUDI_ALLOWED_ORIGINS=https://your-domain.com \
  ...
```

| Value           | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| `true`          | Trust all proxies (simplest option for single-proxy setups) |
| `1`             | Trust the first hop only                                    |
| `loopback`      | Trust loopback addresses (127.0.0.1/::1)                    |
| `172.16.0.0/12` | Trust a specific subnet                                     |

### OIDC/SSO Authentication

Cadence supports Single Sign-On via OpenID Connect (OIDC), allowing users to authenticate with external identity providers.

**Quick Setup (Single Provider):**

```bash
docker run \
  -e OIDC_ENABLED=true \
  -e OIDC_PROVIDER_NAME=Google \
  -e OIDC_PROVIDER_SLUG=google \
  -e OIDC_ISSUER_URL=https://accounts.google.com \
  -e OIDC_CLIENT_ID=your-client-id.apps.googleusercontent.com \
  -e OIDC_CLIENT_SECRET=your-client-secret \
  -e OIDC_SCOPE="openid profile email" \
  -e OIDC_AUTO_PROVISION=true \
  -e BASE_URL=https://your-domain.com \
  ...
```

**Multiple Providers:**

```bash
# Provider 1: Google
-e OIDC_PROVIDER_1_NAME=Google \
-e OIDC_PROVIDER_1_SLUG=google \
-e OIDC_PROVIDER_1_ISSUER=https://accounts.google.com \
-e OIDC_PROVIDER_1_CLIENT_ID=xxx \
-e OIDC_PROVIDER_1_CLIENT_SECRET=xxx \

# Provider 2: Company SSO
-e OIDC_PROVIDER_2_NAME="Company SSO" \
-e OIDC_PROVIDER_2_SLUG=okta \
-e OIDC_PROVIDER_2_ISSUER=https://company.okta.com \
-e OIDC_PROVIDER_2_CLIENT_ID=yyy \
-e OIDC_PROVIDER_2_CLIENT_SECRET=yyy \
-e OIDC_PROVIDER_2_ADMIN_EMAIL_DOMAINS=company.com \
```

**Supported Providers:** Google, Okta, Keycloak, Authentik, PocketID, Azure AD, and any OIDC-compliant provider

**Key Features:**

- Automatic user provisioning on first login
- Account linking for existing users
- Admin role assignment based on email domains
- Hybrid authentication (email/password + SSO)

**Documentation:** See [docs/10-oidc-sso.md](docs/10-oidc-sso.md) for detailed setup guides and provider-specific configuration.

### CalDAV Synchronization

Cadence supports the industry-standard CalDAV protocol, enabling seamless task synchronization with popular CalDAV clients and servers. It's enabled by default.

**Quick Setup:**

```bash
docker run \
  -e ENCRYPTION_KEY=$(openssl rand -hex 32) \
  ...
```

**Supported Clients:**

- **tasks.org** (Android/iOS) - Full task management with recurring tasks
- **Apple Reminders** (iOS/macOS) - Native iOS/macOS integration
- **Thunderbird** (Desktop) - Advanced task features
- **Evolution** (Linux) - Full CalDAV compatibility

**Sync with External Servers:**

Connect Cadence to external CalDAV servers like Nextcloud, Baikal, or other CalDAV-compatible services for bidirectional synchronization.

**Key Features:**

- Bidirectional sync (local ↔ remote)
- Full recurring task support with RRULE
- Conflict detection and resolution
- Background automatic synchronization
- HTTP Basic Authentication
- Encrypted password storage (AES-256-GCM)

**Documentation:** See [docs/11-caldav-sync.md](docs/11-caldav-sync.md) for client setup guides, server configuration, and troubleshooting.

### Database: SQLite or PostgreSQL

Cadence stores everything in a single SQLite file by default, which is all a personal instance needs. For larger or multi-user deployments you can point it at PostgreSQL instead by setting `DATABASE_URL` (for example `postgres://tududi:secret@db:5432/tududi`). The database may be empty; the schema is created on first start. A complete compose setup with a bundled PostgreSQL service is in [docs/examples/docker-compose.postgres.yml](docs/examples/docker-compose.postgres.yml) (copy it next to your `.env` as `docker-compose.yml`), and the deployment guide is [docs/16-postgresql.md](docs/16-postgresql.md).

### Upgrading

Every start backs up the SQLite file next to it (`db-backup-<timestamp>.sqlite3`), then runs pending migrations; the container refuses to start if a migration fails, so the backup is always the state before the upgrade.

#### Upgrading to a release with PostgreSQL support

SQLite stays the default and existing databases are used as they are. Make sure your `.env` does **not** contain a `DATABASE_URL` or `DB_DIALECT` left over from another application: either one switches Cadence to PostgreSQL. As a safety net, the container refuses to start when PostgreSQL is selected but a populated SQLite database is present at `DB_FILE`; unset the variable to keep your data, or set `TUDUDI_ALLOW_DIALECT_SWITCH=true` if you really want an empty PostgreSQL database.

#### v1.1.x to v1.2.x: Volume path change

The Docker volume mount path changed in v1.2.0 from `/app/backend/db` to `/app/db`. If you are upgrading from v1.1.x and your `docker-compose.yml` still uses the old path, **new data will be lost on container recreation** because writes go to an anonymous Docker volume that is discarded when the container is recreated.

**How to check:** Look at your `docker-compose.yml` volumes section:

```yaml
# OLD (v1.1.x) - update this
volumes:
    - ./tududi_db:/app/backend/db
    - ./uploads:/app/backend/uploads

# NEW (v1.2.x+) - use these paths
volumes:
    - ./tududi_db:/app/db
    - ./uploads:/app/uploads
    - ./backups:/app/backups
```

**Migration steps:**

1. Stop the container: `docker-compose down`
2. Update `docker-compose.yml` to use the new volume paths (see above)
3. Start the container: `docker-compose up -d`

Your existing data directory (`./tududi_db`) stays the same - only the mount point inside the container changes. No data copying is needed when using bind mounts.

> **Note:** While you still use the old path, Cadence will print a warning at startup and continue using the old location to prevent data loss. Once you update the volume mount, the warning disappears and writes go to the correct persistent location.

### Documentation

The behaviour pages are in [`docs/`](docs/) (tasks, recurring tasks, Today, projects, views, habits, sync, Google, review…). tududi's own guides at [docs.tududi.com](https://docs.tududi.com) still apply to the parts Cadence did not change.

## Development

```bash
git clone https://github.com/PreciselyWrong/Cadence.git
cd Cadence
npm install
npm run db:init      # first install
npm start            # frontend on :8080 (proxies /api), backend on :3002
```

Checks before pushing: `npm run lint`, targeted Jest runs (`cd backend && npx jest -w 2 <file>`, never the whole suite at once), `npm run frontend:test`, `npm run build`. The Android app is built with `cd android && ./dev.sh --test` (tests) and `./dev.sh` (debug build installed over ADB).

Working on Cadence with a coding agent: start with [AGENTS.md](AGENTS.md).

## API

REST API under `/api` and `/api/v1`, authenticated by session cookie or `Authorization: Bearer <API key>`. Create keys in Profile → API keys; the Swagger docs are at `/api-docs` once signed in.

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3002/api/v1/tasks
```

## Contributing

Issues and pull requests are welcome on [PreciselyWrong/Cadence](https://github.com/PreciselyWrong/Cadence/issues). A bug that also exists in tududi is best reported [upstream](https://github.com/chrisvel/tududi/issues).

## Credits and licence

Cadence is a fork of **[tududi](https://github.com/chrisvel/tududi)**, created by [Chris Veleris](https://github.com/chrisvel), and keeps its [MIT licence](LICENSE) and copyright notice. If you like the app, consider supporting the original project: [buy Chris a coffee](https://coff.ee/chrisveleris), [sponsor him on GitHub](https://github.com/sponsors/chrisvel) or [on Patreon](https://www.patreon.com/ChrisVeleris).

The Android app comes from the former Cadence habits app, now in [`android/`](android/). TickTick served only as a reference for behaviour: none of its code, assets or texts are used.

## Screenshots

![Cadence, light mode](screenshots/all-light.png)

![Cadence, dark mode](screenshots/all-dark.png)
