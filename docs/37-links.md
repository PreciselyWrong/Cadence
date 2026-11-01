# Links

Every web link written in an inbox item, a task (name or note) or a note becomes a **link**: one row per page and user, with what the page says about itself, the user's own note, a status and tags. The **Links** page (web: sidebar and Ctrl+K; Android: link button in the Inbox header) lists them all; inbox cards show the link, its description and its note.

Nothing here uses AI. Finding links, reading page metadata and classifying them is plain code; an assistant (Hermes, through MCP) may later propose tags, notes and statuses with the same tools as the user.

## How a link is captured

- Model hooks on `InboxItem`, `Task` and `Note` (`backend/modules/links/capture.js`) run after every create or text change, on every write path (web, Android sync, MCP, Telegram, imports). They never run inside the request: the work starts after the commit, so a slow or broken site can never delay or fail a capture.
- Links are `http`/`https` URLs with a dotted host; trailing sentence punctuation and an unbalanced closing bracket are not part of the link. At most 20 links per row.
- The URL is normalized (`core/urls.normalizeUrl`): lowercase host, no default port, no fragment, no tracking parameters (`utm_*`, `fbclid`, `gclid`, …), no trailing slash except the root one. The same page saved twice is one link.
- **Note at capture**: a new link found in an inbox item that holds only that link takes the rest of the text as its note (`https://github.com/x/y - CLI for invoices` → note `CLI for invoices`). Links from tasks and notes start without a note.
- **Source**: the link remembers where it was first found (`source_type` `inbox_item` | `task` | `note`, `source_uid`). When an inbox link reappears in a task or a note (typically after converting the idea), the source moves there.

## Metadata

A background queue (`backend/modules/links/jobs.js`) fetches each new link once, one at a time, one second apart:

- **Page**: direct request through the SSRF guard of `modules/url` (only `http`/`https` on ports 80/443, private, loopback, link-local and metadata addresses refused at DNS time and again when the socket opens, at most 5 redirects, 4 s per request and 6 s in all, at most 40 KB read, HTML only). No reading proxy: links are never sent to a third party. Reads `og:title`/`<title>`, `og:description`/`description`, `og:image`, `og:site_name`, `og:type`.
- **GitHub repository** (`github.com/owner/repo`): the public REST API, unauthenticated (60 requests an hour per server address): stars, main language, last push, description, and the first ~400 characters of the README as plain text. When the limit is reached, GitHub lookups wait for the reset; other links keep going.
- **Kind** (`core/urls.classifyKind`): `repo` (GitHub, GitLab, Codeberg, Bitbucket repository paths), `video` (YouTube, Vimeo, … or `og:type` `video.*`), `article` (`og:type` `article`, Medium, Substack, dev.to, …), `tool` (a site's home page), else `other`.
- `fetch_status` is `pending`, then `done` or `failed`. Pending links are queued again when the server starts.

## Fields

| Field | Written by | Notes |
|---|---|---|
| `url`, `title`, `description`, `image_url`, `site_name`, `kind`, `github_stars`, `github_language`, `github_last_commit`, `readme_excerpt`, `fetch_status`, `fetched_at`, `source_type`, `source_uid` | server | read-only for clients |
| `note` | user | free text, empty clears it |
| `status` | user | `new`, `tested` (Try), `kept` (Keep), `parked` (Later), `dropped` (Drop); pressing the active one goes back to `new` |
| tags | user | the existing tags (`links_tags`), nested paths allowed |

Dropped links stay (hidden by default in the list) so a link is never lost by a tap.

## API

- `GET /api/links` — filters `status` (comma list), `kind`, `tag` (exact name), `untagged=true`, `domain` (without `www.`), `q` (title, description, url, note, README), `source_type`, `source_uid`, `sort` (`newest` | `oldest`), `limit` (default 500, max 1000), `offset`. Answers `{ links, total }`.
- `GET /api/links/:uid` — `{ link }`.
- `PATCH /api/links/:uid` — `{ note?, status?, tags? }` (tags: names; replaces the set). `400` for an unknown status or bad tag name, `404` for another user's link.

## Offline sync

Entity `link` (schema 4): fields `note`, `status`; server fields listed above; list `tag_uids`. A device cannot create a link (`unknown_link`), push a server field (`unknown_field:url`) or an unknown status (`invalid_status`). Android reads links offline (Room table `links`, v9) and writes note and status through its outbox.

## MCP

`list_links` (same filters, `query` for the text search, `untagged` to find links still to tag), `get_link`, `update_link` (`note`, `tags`, `status`). They never change the URL or the metadata.

## Clients

- **Web**: `/links` (`frontend/components/Links/`): search, kind, status (default: not dropped), tag, site and sort filters, remembered per browser; cards with title, two lines of description, domain, kind badge, GitHub stats, README start for repositories, note (click to write, Enter saves), tags, status buttons, open, go to the source. In the inbox, an item with a link shows the link card and its note; the item's text is shown only when it says more than the note.
- **Android**: Links screen from the Inbox header (search, kind and "Jetés" chips, same cards, note in a small dialog, status chips); inbox ideas show the link summary and its note, editable.
