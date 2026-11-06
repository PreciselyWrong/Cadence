# Links

Every web link written in an inbox item, a task (name or note) or a note becomes a **link**: one row per page and user, with what the page says about itself, the user's own note, a status and tags. The **Links** page (web: sidebar and Ctrl+K; Android: Listes in Tasks, or the link button in the Inbox header) lists them all; inbox cards show the link, its description and its note.

Nothing here uses AI. Finding links, reading page metadata and classifying them is plain code; an assistant (Hermes, through MCP) may later propose tags, notes and statuses with the same tools as the user.

## How a link is captured

- Model hooks on `InboxItem`, `Task` and `Note` (`backend/modules/links/capture.js`) run after every create or text change, on every write path (web, Android sync, MCP, Telegram, imports). They never run inside the request: the work starts after the commit, so a slow or broken site can never delay or fail a capture.
- Links are `http`/`https` URLs with a dotted host; trailing sentence punctuation and an unbalanced closing bracket are not part of the link. At most 20 links per row.
- The URL is normalized (`core/urls.normalizeUrl`): lowercase host, no default port, no fragment, no tracking parameters (`utm_*`, `fbclid`, `gclid`, …), no trailing slash except the root one. The same page saved twice is one link.
- **Note at capture**: a new link found in an inbox item that holds only that link takes the rest of the text as its note (`https://github.com/x/y - CLI for invoices` → note `CLI for invoices`). Links from tasks and notes start without a note.
- **Source**: the link remembers where it was first found (`source_type` `inbox_item` | `task` | `note`, `source_uid`). When an inbox link reappears in a task or a note (typically after converting the idea), the source moves there.

- **A shared address goes straight to Links**: an inbox item that holds a single link is marked `processed` as soon as the link is found, on every capture path (Android share, desktop, web, Telegram). The link keeps the rest of the text as its note.

## Adding a link directly

`POST /api/links` `{ url, title?, note?, status?, tags? }` answers `{ link, created }`: the same page twice is one link and what it holds stays. `POST /api/links/import` `{ items: [...] }`, at most 500 per call, answers `{ created, existing, invalid }`; one bad entry never stops the rest. New links go through the same reading queue, one second apart, so 800 bookmarks take about a quarter of an hour.

On the web, **Import bookmarks** on the Links page reads a Firefox export (`bookmarks.html`, Library › Import and Backup › Export) in the browser, `frontend/utils/bookmarksImport.ts`: its tags, plus the folder it sits in as a tag, skipping the browser's own folders. It sends batches of 200.

## Themes

A theme is the first segment of a tag (`dev/tools` is in `dev`). The gallery groups links by the theme of their first tag, with the others under "No theme" at the end; it is the default view on both clients. A link in the gallery or list becomes a task in one tap: the task is named after the link and keeps its address (and note) as its note, and the link counts as kept.

## Metadata

A background queue (`backend/modules/links/jobs.js`) fetches each new link once, one at a time, one second apart:

- **Page**: direct request through the SSRF guard of `modules/url` (only `http`/`https` on ports 80/443, private, loopback, link-local and metadata addresses refused at DNS time and again when the socket opens, at most 5 redirects, 4 s per request and 6 s in all, at most 40 KB read, HTML only). No reading proxy: links are never sent to a third party. Reads `og:title`/`<title>`, `og:description`/`description`, `og:image`, `og:site_name`, `og:type`.
- **GitHub repository** (`github.com/owner/repo`): the public REST API, unauthenticated (60 requests an hour per server address): stars, main language, last push, description, and the first ~400 characters of the README as plain text. When the limit is reached, GitHub lookups wait for the reset; other links keep going.
- **Kind** (`core/urls.classifyKind`): `repo` (GitHub, GitLab, Codeberg, Bitbucket repository paths), `video` (YouTube, Vimeo, … or `og:type` `video.*`), `article` (`og:type` `article`, Medium, Substack, dev.to, …), `tool` (a site's home page), else `other`.
- `fetch_status` is `pending`, then `done` or `failed`. Pending links are queued again when the server starts.
- **Rows saved before capture existed**: at each server start, inbox items (except deleted or trashed ones), tasks (except habits) and notes whose text holds `http` are scanned as if just written (`capture.captureExisting`, inbox first). It is idempotent: a link already saved is only found again, and its note is never touched.
- **Reading again** (`jobs.refreshStale`, daily at 02:00 UTC, at most 25 links per run, oldest reading first, dropped links skipped): a `done` link is read again 30 days after its last reading (stars, last push, README move), a `failed` link 7 days after. A reading never erases a field an earlier one found, and a page that cannot be read this time stays `done` with what it had; only `fetched_at` moves.
- Only GitHub repositories get stats and a README start; GitLab, Codeberg and Bitbucket repositories get the page metadata only.

## Fields

| Field | Written by | Notes |
|---|---|---|
| `url`, `title`, `description`, `image_url`, `site_name`, `kind`, `github_stars`, `github_language`, `github_last_commit`, `readme_excerpt`, `fetch_status`, `fetched_at`, `source_type`, `source_uid` | server | read-only for clients |
| `note` | user | free text, empty clears it |
| `status` | user | `new` (À lire), `to_evaluate` (À évaluer), `tested` (À tester), `kept` (Gardé), `parked` (Plus tard), `dropped` (Archivé); pressing the active one goes back to `new` |
| `review_at` | user | day to look at a parked link again (`YYYY-MM-DD`, or none); a `parked` status without `review_at` sets today + 30 days (server day). Never a due date |
| tags | user | the existing tags (`links_tags`), nested paths allowed |

Dropped links stay (hidden by default in the list) so a link is never lost by a tap.

## API

- `GET /api/links` — filters `status` (comma list), `kind`, `tag` (exact name), `untagged=true`, `domain` (without `www.`), `q` (title, description, url, note, README), `source_type`, `source_uid`, `sort` (`newest` | `oldest`), `limit` (default 500, max 1000), `offset`. Answers `{ links, total }`.
- `GET /api/links/:uid` — `{ link }`.
- `PATCH /api/links/:uid` — `{ note?, status?, tags?, review_at? }` (tags: names; replaces the set; `review_at`: `YYYY-MM-DD` or `null`). `400` for an unknown status, a bad tag name or a review day that is not a date, `404` for another user's link.

## Offline sync

Entity `link` (schema 4): fields `note`, `status`, `review_at`; server fields listed above; list `tag_uids`. A device cannot create a link (`unknown_link`), push a server field (`unknown_field:url`), an unknown status (`invalid_status`) or a review day that is not a date (`invalid_review_at`). Android reads links offline (Room table `links`, v11, migration 10→11 clears the cursor) and writes note, status and review day through its outbox. A client that predates `review_at` ignores the field.

## MCP

`list_links` (same filters, `query` for the text search, `untagged` to find links still to tag), `get_link`, `update_link` (`note`, `tags`, `status`, `review_at`). They never change the URL or the metadata.

## Clients

- **Web**: `/links` (`frontend/components/Links/`): search, kind, status (default: not dropped), tag, site and sort filters, remembered per browser; cards with title, two lines of description, domain, kind badge, GitHub stats, README start for repositories, note (click to write, Enter saves), tags, status buttons, Attach to a project (see Web inbox triage), open, go to the source. A **List / Gallery** switch in the header (remembered for the account in `ui_settings.viewTypes.links`) turns the page into a gallery: picture cards (two to four columns) with the page image (`image_url`, else the site's initial), title, site and up to three tags; a card opens the page in a new tab; the filters apply the same way. In the inbox, an item with a link shows the link card and its note; the item's text is shown only when it says more than the note.
- **Android**: Links screen from Listes or the Inbox header (search, kind, status and "Archivés" chips, same cards, note in a small dialog, status chips, tag picker); inbox ideas that hold a link are triaged in one tap (below). All writes go through the outbox (`link` note, status, `tag_uids`; `inbox_item` status), so triage works offline.

### Android inbox triage

- **Card**: title, 1-2 lines of description, domain, kind, GitHub stars, the user's note. Tapping the card unfolds the README start, an inline "Ajouter une note" field (saved on Done, on leaving the field and before any decision) and the tags; "Ouvrir" is a separate icon button.
- **Decisions** (calm chips; each marks the inbox item `processed`, so it leaves the Inbox but is never deleted, and the link stays in the library):

| Chip | Link status | Also |
|---|---|---|
| Garder | `kept` | |
| À tester | `tested` | creates the task "Tester : <title>" (note: the URL then the user's note) in the chosen project or none |
| Rattacher | `kept` | shown when the user has an open project; creates a task named after the link (note: the URL then the user's note) in the chosen project (required), as the gallery and the web's Attach |
| Plus tard | `parked` | review day `review_at` = today + 30 days, synced (the same on the web) |
| Jeter | `dropped` | |

  Writes happen after a 4.5 s window; the snackbar names the link and "Annuler" drops them. "Plus…" keeps Aujourd'hui / Planifier / Projet to turn the idea into a task (that path deletes the inbox item, as before).
- **Swipe** on a link card: right = Garder, left = Jeter (fixed; the task swipe configuration is task-specific).
- **Trier les liens (n)**: shown from two links; one link at a time, full width, Garder, À tester, Plus tard and Jeter plus "Passer" (no Rattacher there). The queue is the Inbox links, oldest first; a skipped link goes to the end (order kept on the device), so reopening resumes where the user stopped.
- The decision-to-writes mapping is `model/LinkTriage.kt` (pure, tested in `LinkTriageTest`); the repository additions are `TaskRepository.setLinkTags` and `processInboxItem`.

### Android discoveries gallery

- The Links screen has a list / gallery switch in its header (remembered on the device). The gallery is a grid of cards (two columns on a phone): the page image when the server read one (`image_url`; no image, no placeholder), title, site, GitHub stars, the README start for a repository (else the description), the note, and four one-tap decisions. It shows the same links and filters as the list, newest first.
- **Decisions** (mapping in `model/LinkTriage.kt`, `GALLERY_DECISIONS`):

| Chip | Link status | Also |
|---|---|---|
| Tester | `tested` | task "Tester : <title>" in the chosen project or none (as in the inbox) |
| Rattacher | `kept` | task named after the link, with the URL then the note as task note, in the chosen project (a project is required). A link has no project: the task is what files it there |
| Reporter | `parked` | `review_at` = today + 30 days |
| Jeter | `dropped` | |

  When an open inbox idea holds the link, it is marked `processed` too. The card leaves the gallery at once; the writes wait for the 4.5 s "Annuler" window, then go through the outbox (offline included).

### Web inbox triage

- A link card in the Inbox (`frontend/components/Links/LinkTriageActions.tsx`) has five decisions, one tap each: Keep, Try, Attach, Later, Drop. Each sets the link status through `PATCH /api/links/:uid` and marks the inbox item `processed`; there is no undo, and nothing is written later than the tap.
- Try opens a project choice (a project or none), then creates the task "Try: <title>" with the address and the note as task note, and sets the link to `tested`.
- Attach (shown when the user has projects) opens a project choice (a project is required), then creates a task named after the link (title, else domain, else address) with the address and the note as task note in that project, and sets the link to `kept`, as Android's Rattacher. The same **Attach** button sits on each `/links` card (List view), without an inbox item to process. Logic: `frontend/utils/linkTriage.ts`, `frontend/components/Links/LinkProjectPicker.tsx`.
- Later sends `status: parked` without a date: the server sets `review_at` to today + 30 days. The `/links` card shows "Review on <date>" for a parked link.
- The date is the synced `review_at` on both clients; Android keeps no local copy of it.
