# Links

A link has two homes: a **task** (something to do: try, read, watch) or the **pages of a project** (material for it). Anything else is a note. There is no links library to sort, tag or review (`docs/fork/PLAN-links.md`, decided 2026-11-12).

Reading pages, naming tasks and checking addresses is plain code; no AI touches links (the classifier files tasks and notes only, `docs/41-auto-classify.md`).

## Capture: an address becomes a task

A link lives in a task (something to do) or in a project's pages (material for a project); anything else is a note (`docs/fork/PLAN-links.md`).

- **Name, by code** (`modules/links/core/taskName.js`, mirrored by `frontend/utils/linkTaskName.ts` and Android `model/IdeaTasks`, `links/LinkKinds.kt`): repository or tool → « Essayer : <title> », article → « Lire : <title> », video → « Regarder : <title> », any other page → the title alone. The verbs are translations (`links.taskVerb.*`, Android `link_task_*`); the server reads the user's language. Without a page title: the repository (`owner/repo`), else the site, else the address. The kind comes from the address (`classifyKind`), and from `og:type` when the server read it (`GET /api/url/title` answers `kind`).
- **The task**: the address in the note (then the words written with it), `source: link`, `source_url`, and `needs_when: true` unless a project is chosen, so it waits in Inbox › « Tâches à classer » with « Quand ? » (`docs/41-auto-classify.md`). `POST /api/task` accepts `needs_when` on creation.
- **Where**: the Android share sheet (one tap on « Tâche », name editable above), an Inbox idea that is only an address (web panel: editable name and « Tâche »; Android: « Tâche » creates it at once, with « Annuler »), the Firefox add-on (toolbar button or Alt+Shift+K: editable name, « Créer la tâche »; right click: one click). Secondary choices on the same sheet: **Projet…** (the page goes to a project), **Note**, **Inbox**.
- **« Déjà dans … »**: `GET /api/links/lookup?url=&title=` answers `{ url, kind, task_name, tasks, projects }`: the open tasks whose name or note holds the same address (normalized, `www.` ignored, `core/urls.addressKey`) and the projects that hold it. Shown above the name with **Ouvrir**; the main button becomes **Ajouter quand même**. Android reads the same from Room, offline (`TaskRepository.placesOf`).
- `POST /api/links/task { url, title?, name?, note?, project_uid? }` makes the task in one call (add-on, agents): `201 { task: { uid, name, note } }`, `400` for an address that is not a web page.

## Previews

Every address written in a task note, a note or a project description shows a card: picture, title, one line of description, site, and for a GitHub repository « ★ stars · language · last push ». Web: `frontend/components/Links/LinkPreviews.tsx` (at most 5 addresses, once each) in the task panel, the note editor and under the project description; Android: the same cards from the Room cache `link_previews` (offline).

- **Server cache by address** (`modules/links/previews.js`, table `link_previews`, one row per normalized address without `www.`, shared by all users: public page metadata only). `GET /api/url/title?url=` reads the row, or reads the page once (same reader as links: SSRF guard, direct request only, no reading proxy; GitHub API for a repository) and stores it. A page is read again after 30 days, a failed read after an hour; a new read never erases what an earlier one found. Concurrent asks for one address share one read. Context addresses (IP, `.lan`, …) are never read.
- Answer: `url`, `title`, `description`, `image`, `site_name`, `kind`, `github_stars`, `github_language`, `github_last_commit`, and `error` when nothing could be read.
- A YouTube video gets the picture YouTube serves for it (`i.ytimg.com/vi/<id>/hqdefault.jpg`, from the address alone, `core/urls.youtubeThumbnail`) when its page names none, also for rows read before.

## Rows

A task whose note holds an address shows the page on its row instead of the raw address: the site's icon and name (`site_name` of the preview, else the host without `www.`) under the title, and the page's picture at the 1.91:1 of shared pictures, nothing when it has none (no screenshot). The rest of the note keeps its preview line. The icon is the one of the origin badge (`GET /api/links/favicon?host=`, read by the server: the site never sees who looks), left out of the site line when the badge already shows it.

- Web: rule `frontend/components/Links/taskLink.ts`, marks `Links/LinkMarks.tsx`; task lists (`TaskRowCollapsed`, small picture at the end of the row), Today (`Today/TaskLine.tsx`, same), cards of Plan, the inbox column and the project board (`Shared/task/TaskCardBody.tsx`, picture as a cover on top).
- Android: rule `links/TaskLinks.kt`, marks `ui/LinkMarks.kt`, in `TaskRow` (every list, Today, Plan); picture and site name from the Room cache `link_previews`, offline; icon through `ui/SiteIcon.kt`.
- Project pages show the site's icon instead of the initial (the initial when the site has none), and the page's picture when it has one, on the web and Android.

## Project pages

A project gathers its pages: the material it works from (`links` rows with a `project_id`; one row per address and project, unique `links_project_url_unique`; the same address may be in two projects). A page keeps its address, title, the user's short note and what the page says about itself (read in the background like any link).

- **Web**: a « Pages » section under the project's tasks (domain initial, title, site, note; « Not found » after a check), **⋯** per page: Create a task (in the project, named by the capture rule, the address in its note), Edit (title and note), Remove. Project **⋯**: « Copy the pages as Markdown » (`- [Title](url) — note`, `frontend/utils/projectPages.ts`) and « Check the pages ». Inbox › Projet… adds the page.
- **Android**: the same section and menus on the project screen; Projet… from the share sheet and the Inbox adds the page offline (sync).
- **Firefox add-on**: « Envoyer au projet » (this tab) or « Envoyer le groupe » (every tab of its tab group), « Ouvrir le projet » (its pages in new tabs gathered in a tab group named like the project; Firefox 139+, `tabGroups`).
- **Check** (`modules/links/check.js`): each address asked once through the SSRF guard (HEAD, GET when HEAD is refused, redirects followed). 404, 410 and a host that does not answer are dead; 401 and 403 are pages behind a sign-in, never dead; anything else unknown. Nothing is deleted.

API (under `/api` and `/api/v1`):

- `GET /projects/:uid/pages` → `{ pages }` (read access).
- `POST /projects/:uid/pages` `{ url, title?, note? }` → `201 { page, created: true }` or `200 { created: false }` for an address already there; `{ pages: [...] }` (at most 100, a tab group) → `{ created, existing, invalid }`. Write access.
- `POST /projects/:uid/pages/check` → `{ results: [{ uid, url, state: ok | dead | unknown, code }] }`.
- `PATCH /links/:uid` (title, note, new address) and `DELETE /links/:uid` (remove) as before.
- Sync `link`: a device adds a page with a new uid, `url` and `project_uid` (else `project_required`; a bad address `invalid_url`); the address of an existing page does not change by sync (`url_readonly`). The server normalizes the address and reads the page.
- MCP: `add_project_page` (`project_uid`, `url`, `title?`, `note?`), `list_project_pages` (`project_uid`), and `create_task` takes `url` (named by the capture rule when no name is given, the address first in the note, `source: link`, waiting for « Quand ? » without a project).

## Task to project

**Transformer en projet** on any one-off task (web: task row ⋯ and task page ⋯; Android: task sheet ⋯ and row menu; MCP `convert_task_to_project`; the triage action `to_project` uses the same operation): the task's name becomes the project's name, its note the description, its subtasks the project's tasks, the addresses of its note the project's pages, its tags and domain follow; the task is removed. Refused for a recurring task, a subtask, a task that follows a `TODO.md` file (400) and someone else's task (403). `POST /api/task/:uid/to-project` → `201 { project: { uid, name } }` (`backend/modules/tasks/operations/toProject.js`). Android sends it as a deferred call (`task-to-project:<uid>`) and hides the task until the sync brings the project.

## Projects not touched for 30 days

`GET /api/projects/dormant` → `{ projects: [{ uid, name, status, last_activity_at }] }`: open projects (not done, cancelled or archived; no templates) with no change to the project, its tasks or its pages for 30 days, oldest first (`review/service.computeDormantProjects`). Web: folded « Not touched for 30 days (N) » at the bottom of Projects; Android: the same at the bottom of the projects list (last answer kept offline). **Garder** marks the project reviewed (`POST /api/project/:uid/reviewed`, the review's « Keep as it is ») so it leaves the list for 30 days. Nothing is archived or closed.


## Finding tasks with a link

« Avec un lien » lists the tasks whose name or note holds a web address: `GET /api/tasks?has_link=true` (web: Tasks › filter menu « With a link »; Android: the same filter, read from Room offline).

## Bookmarks import

Web: Projects › ⋯ › « Import bookmarks » reads a Firefox export (`bookmarks.html`, Library › Import and Backup › Export) in the browser (`frontend/utils/bookmarksImport.ts`): the pages grouped by folder, each page once. One folder becomes the pages of a project: a new one named like the folder (default) or one chosen, by batches of 100 (`POST /api/projects/:uid/pages`).

## Addresses

- `http`/`https` with a dotted host. Normalized (`core/urls.normalizeUrl`): lowercase host, no default port, no fragment, no tracking parameters (`utm_*`, `fbclid`, `gclid`, …), no trailing slash except the root one. `addressKey` also drops `www.`: two spellings of one page are one.
- Context addresses (`core/urls.isContextUrl`: IP addresses, `.lan`, `.local`, `.ts.net`, …, mail, chats, searches, CI runs, the hosts of `TUDUDI_LINKS_IGNORE_HOSTS`) are never read for a preview nor made pages from a task's note.
- **Reading a page** (`modules/links/jobs.js`, `fetcher.js`): one at a time, one second apart, through the SSRF guard of `modules/url` (`http`/`https` on ports 80/443, private addresses refused at DNS time and when the socket opens, 5 redirects, 4 s per request, 6 s in all, 40 KB, HTML only), never through a reading proxy. Reads title, description, picture, site name and `og:type`; for a GitHub repository the public API gives stars, language, last push and the README start (60 requests an hour; on the limit, GitHub lookups wait). A title given at saving stays. A page is read again 30 days later (02:00 UTC, 25 per run), a failed one 7 days later; a reading never erases what an earlier one found.
- **Kind** (`core/urls.classifyKind`): `repo`, `video`, `article`, `tool` (a site's home), else `other`.

## Data takeover (2026-11-12)

Migration `20261112230000-links-takeover`, once, SQLite and PostgreSQL: an archived link is deleted; a link in a project stays as its page; a link whose source task still exists is deleted (the task holds the address); any other link becomes a task « Verbe : titre » waiting for « Quand ? », with the user's note (never the « Résumé auto » paragraphs) and the link's tags. Agents' slot proposals for links are deleted. The library's columns (`status`, `review_at`, `source_type`, `source_uid`) and `links_tags` are no longer read.

## Older clients

A former Android client keeps syncing: it receives pages as links, and its pushes of `status` or `review_at` are accepted and ignored. Its « Ajouter aux liens » and library calls answer 400 or 404 and land in its refused-calls list. The current client's Room migration drops the library columns and takes a fresh snapshot.
