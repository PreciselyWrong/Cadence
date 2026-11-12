# Links

A **link** is a web page the user chose to keep: one row per page and user, with what the page says about itself, the user's own note, a status, an optional review day, a project and tags. Links are made only on purpose, never by the server: an inbox idea that holds an address stays in the Inbox until the user decides what to do with it (below). The **Links** page (web: sidebar and Ctrl+K; Android: Listes in Tasks, or the link button in the Inbox header) is the library of what was kept.

Finding links, reading page metadata and classifying their kind is plain code. AI is optional and only gives themes (below); agents use the same tools as the user through MCP.

## Capture: an address becomes a task

A link lives in a task (something to do) or in a project's pages (material for a project); anything else is a note (`docs/fork/PLAN-links.md`).

- **Name, by code** (`modules/links/core/taskName.js`, mirrored by `frontend/utils/linkTaskName.ts` and Android `model/IdeaTasks`, `links/LinkKinds.kt`): repository or tool → « Essayer : <title> », article → « Lire : <title> », video → « Regarder : <title> », any other page → the title alone. The verbs are translations (`links.taskVerb.*`, Android `link_task_*`); the server reads the user's language. Without a page title: the repository (`owner/repo`), else the site, else the address. The kind comes from the address (`classifyKind`), and from `og:type` when the server read it (`GET /api/url/title` answers `kind`).
- **The task**: the address in the note (then the words written with it), `source: link`, `source_url`, and `needs_when: true` unless a project is chosen, so it waits in Inbox › « Tâches à classer » with « Quand ? » (`docs/41-auto-classify.md`). `POST /api/task` accepts `needs_when` on creation.
- **Where**: the Android share sheet (one tap on « Tâche », name editable above), an Inbox idea that is only an address (web panel: editable name and « Tâche »; Android: « Tâche » creates it at once, with « Annuler »), the Firefox add-on (toolbar button or Alt+Shift+K: editable name, « Créer la tâche »; right click: one click). Secondary choices on the same sheet: **Projet…** (the page goes to a project), **Note**, **Inbox**.
- **« Déjà dans … »**: `GET /api/links/lookup?url=&title=` answers `{ url, kind, task_name, tasks, projects }`: the open tasks whose name or note holds the same address (normalized, `www.` ignored, `core/urls.addressKey`) and the projects that hold it. Shown above the name with **Ouvrir**; the main button becomes **Ajouter quand même**. Android reads the same from Room, offline (`TaskRepository.placesOf`).
- `POST /api/links/task { url, title?, name?, note?, project_uid? }` makes the task in one call (add-on, agents): `201 { task: { uid, name, note } }`, `400` for an address that is not a web page.

## How a link is made

- **Nothing is captured automatically.** Saving an inbox item, a task or a note never creates a link, on any path (web, Android sync, MCP, Telegram, imports). An inbox item that is only an address, or holds one, stays `added` in the Inbox until the user decides.
- **Triage of an idea** (web and Android, one panel): preview of the link if there is one, labels, project, then one decision:
  - **Task**: creates the task (name = the page title if known, else the idea's text without the address, else the domain; note = the address and the rest of the text; labels and project chosen), then `PATCH /api/inbox/:uid/process { task_uid }`.
  - **Links**: `POST /api/links { url, title?, note?, tags?, project_uid?, source_type: 'inbox_item', source_uid }`, then `PATCH /api/inbox/:uid/process { link_uid }`.
  - **Note** and **Delete**: as for any idea.
- **Other ways in**: `POST /api/links` on purpose (Firefox add-on, import, MCP `create_link`, a task or note's **Add to links** with `source_type` `task` or `note`), `POST /api/links/import`, and the sync `link` entity never creates one (a device only edits or deletes).
- **Context addresses are never proposed as links** (`core/urls.isContextUrl`): IP addresses and private names (`.lan`, `.local`, `.localhost`, `.localdomain`, `.internal`, `.intranet`, `.home.arpa`, `.ts.net`), personal apps (Gmail, Google Calendar and Meet, Gemini, ChatGPT, Claude, Outlook, WhatsApp Web), searches (`google.*/search`), the LinkedIn feed, messages and notifications, and CI runs (`github.com/<owner>/<repo>/actions…`, GitLab `/-/pipelines`, `/-/jobs`). The server's own sites go in `TUDUDI_LINKS_IGNORE_HOSTS` (comma separated, each host with its subdomains): they are private, so they are not in the code. The clean-up below uses this list; saving one on purpose still works.
- **Clean-up, once per server**: at the first start with this rule, links that came from a task or a note, or whose address is context, and that the user never touched (status To read, no note, tags, project or review day) are deleted like a delete from the Links page: devices receive the deletion and the address goes into `link_exclusions`. The `links_context_pruned` setting marks it done.
- Links are `http`/`https` URLs with a dotted host. The URL is normalized (`core/urls.normalizeUrl`): lowercase host, no default port, no fragment, no tracking parameters (`utm_*`, `fbclid`, `gclid`, …), no trailing slash except the root one. The same page saved twice is one link.
- **Source**: a link remembers where it was made (`source_type` `inbox_item` | `task` | `note`, `source_uid`). The source is not moved afterwards.

## Statuses

| Status | Meaning | Web / Android label |
|---|---|---|
| `new` | to read; the default | To see / À voir |
| `dropped` | set aside: hidden by default, never deleted | Archived / Archivé |

- A former status (`to_evaluate`, `tested`, `kept`, `parked`) is read as `new` on every input path (REST, import, sync, MCP). A former `parked` also sets `review_at` to today + 30 days when the write gives none.
- Migration `20261107120000-links-two-statuses`: `UPDATE links SET status = 'new'` for the former statuses. Idempotent, SQLite and PostgreSQL.
- "Later" is no status: it is the review day `review_at`. A link still to read comes back on that day as a card « Lien à revoir » in « À trier » (`docs/40-triage.md`): **Garder** (no more review day), **Archiver**, **Dans 30 jours**.

## Managing a link

`PATCH /api/links/:uid` takes `title`, `url`, `project_uid`, `note`, `status`, `review_at` and `tags`; only what is given changes. A new address is normalized, refused if invalid (400) or held by another link (409), clears what was read of the old page and reads the new one. `project_uid` (null takes it out) must be a project the user can write to; deleting the project leaves the link without one.

`DELETE /api/links/:uid` deletes for good. The address goes into `link_exclusions`, as does the old address after a move, so a later save of the text it came from does not bring the link back by itself. Saving the page on purpose (`POST /api/links`, import, the add-on) lifts the exclusion. Devices write the title and the project through `link` sync fields and delete with a sync `delete`; a new address goes through `PATCH`, as a deferred call. MCP: `update_link`, `delete_link`.

Clients show the same controls on a card: one status control (archive or unarchive) and **⋯** (Edit, Create a task, Delete). "Archived" only sets the link aside; a project filter joins the others.

## Adding a link directly

`POST /api/links` `{ url, title?, note?, status?, tags?, project_uid?, source_type?, source_uid? }` answers `{ link, created }`:
- `source_type` is `inbox_item`, `task` or `note` and must name one of the user's own (400 for another type, 404 for another user's; an inbox item that was deleted or trashed counts as not found).
- `project_uid` must be a project the user can write to (400 otherwise).
- `status` is `new` (default) or `dropped`; a former status is read as `new`.
- The same page twice is one link and what it holds stays.

`POST /api/links/import` `{ items: [...] }`, at most 500 per call, answers `{ created, existing, invalid }`; one bad entry never stops the rest. New links go through the same reading queue, one second apart, so 800 bookmarks take about a quarter of an hour.

On the web, **Import bookmarks** on the Links page reads a Firefox export (`bookmarks.html`, Library › Import and Backup › Export) in the browser, `frontend/utils/bookmarksImport.ts`: its tags, plus the folder it sits in as a tag, skipping the browser's own folders. It sends batches of 200.

The Firefox add-on (`integrations/firefox-addon/`) saves the current page or a link through `POST /api/links` with an API token; it asks for access to that server only.

## Metadata

A background queue (`backend/modules/links/jobs.js`) fetches each new link once, one at a time, one second apart, from the moment it is saved:

- **Page**: direct request through the SSRF guard of `modules/url` (only `http`/`https` on ports 80/443, private, loopback, link-local and metadata addresses refused at DNS time and again when the socket opens, at most 5 redirects, 4 s per request and 6 s in all, at most 40 KB read, HTML only). No reading proxy: links are never sent to a third party. Reads `og:title`/`<title>`, `og:description`/`description`, `og:image`, `og:site_name`, `og:type`.
- **GitHub repository** (`github.com/owner/repo`): the public REST API, unauthenticated (60 requests an hour per server address): stars, main language, last push, description, and the first ~400 characters of the README as plain text. When the limit is reached, GitHub lookups wait for the reset; other links keep going.
- **Kind** (`core/urls.classifyKind`): `repo` (GitHub, GitLab, Codeberg, Bitbucket repository paths), `video` (YouTube, Vimeo, … or `og:type` `video.*`), `article` (`og:type` `article`, Medium, Substack, dev.to, …), `tool` (a site's home page), else `other`.
- `fetch_status` is `pending`, then `done` or `failed`. Pending links are queued again when the server starts.
- **Title**: a reading only fills a missing title; one given at saving (bookmark, add-on) or read earlier stays, even when the page changes its title.
- **Reading again** (`jobs.refreshStale`, daily at 02:00 UTC, at most 25 links per run, oldest reading first, dropped links skipped): a `done` link is read again 30 days after its last reading (stars, last push, README move), a `failed` link 7 days after. A reading never erases a field an earlier one found, and a page that cannot be read this time stays `done` with what it had; only `fetched_at` moves.
- Only GitHub repositories get stats and a README start; GitLab, Codeberg and Bitbucket repositories get the page metadata only.

## Themes

A theme is the first segment of a tag (`dev/tools` is in `dev`). The gallery groups links by the theme of their first tag, with the others under "No theme" at the end; it is the default view on both clients. A link in the gallery or list becomes a task in one tap: the task is named after the link and keeps its address (and note) as its note; the link stays where it is.

**Themes by AI** are optional, off by default: Profile › Daily brief (web), Réglages › Résumé (Android), `ui_settings.brief.linkThemes.enabled`. After the triage job each night, up to 40 links without a tag get one theme, a plain tag (`modules/links/themes.js`). A tagged link is never touched, and a tag is removed like any other.

## Fields

| Field | Written by | Notes |
|---|---|---|
| `url`, `title` (when given at saving), `description`, `image_url`, `site_name`, `kind`, `github_stars`, `github_language`, `github_last_commit`, `readme_excerpt`, `fetch_status`, `fetched_at`, `source_type`, `source_uid` | server | read-only for clients |
| `note` | user | free text, empty clears it |
| `status` | user | `new` or `dropped` (see Statuses) |
| `review_at` | user | day to look at the link again (`YYYY-MM-DD`, or none); never a due date |
| `project_id` | user | project the link is in; cleared when the project is deleted |
| tags | user | the existing tags (`links_tags`), nested paths allowed |

Dropped links stay (hidden by default in the list) so a link is never lost by a tap.

## API

- `GET /api/links` — filters `status` (comma list; former statuses are read as `new`), `kind`, `tag` (exact name), `untagged=true`, `domain` (without `www.`), `q` (title, description, url, note, README), `source_type`, `source_uid`, `sort` (`newest` | `oldest`), `limit` (default 500, max 1000), `offset`. Answers `{ links, total }`.
- `GET /api/links/:uid` — `{ link }`.
- `POST /api/links` and `POST /api/links/import` — see Adding a link directly.
- `PATCH /api/links/:uid` — `{ title?, url?, project_uid?, note?, status?, tags?, review_at? }`. `400` for an unknown status, a bad tag name, a project that is not the user's, or a review day that is not a date; `404` for another user's link; `409` for an address another link has.
- `DELETE /api/links/:uid` — deletes for good.
- `GET /api/url/title?url=…` — preview of a page before any link exists (SSRF guard). Answers `title`, `description`, `image`, `site_name` (`null` when the page does not have them) and `error` when nothing could be read.
- Inbox: `PATCH /api/inbox/:uid/process` takes `task_uid`, `project_uid`, `note_uid` or `link_uid` (a link of the user, else 404) and marks the idea `processed`.

## Offline sync

Entity `link` (schema 4): fields `note`, `status`, `review_at`; server fields listed above; list `tag_uids`. A device cannot create a link (`unknown_link`), push a server field (`unknown_field:url`), an unknown status (`invalid_status`) or a review day that is not a date (`invalid_review_at`). A former status pushed by a device is read as `new` (a former `parked` gets its review day). Android reads links offline (Room table `links`) and writes note, status and review day through its outbox. A client that predates `review_at` ignores the field.

## MCP

`create_link` (same as `POST /api/links`), `group_links` (`uids`, `theme`: adds one tag to each, keeping the others), `propose_link_slot` (a slot in the agenda, waiting for the user in the triage queue, `docs/40-triage.md`), `list_links` (same filters, `query` for the text search, `untagged` to find links still to tag), `get_link`, `update_link` (`note`, `tags`, `status`, `review_at`). They never change the URL or the metadata.

## Clients

- **Web**: `/links` (`frontend/components/Links/`): list by default; filters for search, status (`dropped` under "Archived"), tag, project and site; cards with title, description, domain, kind, GitHub stats, note, tags, project and the status and ⋯ menus. A List / Gallery switch turns the page into picture cards.
- **Android**: Links screen from Listes or the Inbox header (search, kind, status and "Archivés" chips, same cards, note in a small dialog, tag picker).
- The Inbox decisions and the cards' controls are described in the clients' own notes (`docs/fork/WEB-UX-NOTES.md`, `docs/fork/ANDROID-UX-NOTES.md`) and in `frontend/components/Links/`, `android/`.
