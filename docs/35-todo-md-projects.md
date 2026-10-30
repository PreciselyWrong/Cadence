# TODO.md projects (fork)

Folders on the server hold projects: each sub-folder is one project, and its `TODO.md` is that project's task list. Cadence shows them (web and Android) and lets you add tasks and check them off; the **file stays the source of truth**, so it can be edited anywhere (`git pull`, an editor) at any time. Module: `backend/modules/todo-md/`.

**Related:** [Offline sync](30-offline-sync.md), [Projects](06-projects.md), [Backups](backups.md)

## Setup

Off unless `TUDUDI_TODO_ROOT` is set to a directory the server can read and write.

| Variable                 | Meaning                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `TUDUDI_TODO_ROOT`       | Root folder, for example `/app/todo-projects`. Each direct sub-folder with a `TODO.md` is a project. |
| `TUDUDI_TODO_USER_EMAIL` | Account the projects belong to. Default: the first administrator, else the first account.            |

In Docker, bind-mount a **dedicated** folder read-write (see the commented example in `docker-compose.yml`):

```yaml
volumes:
    - /mnt/user/appdata/cadence-todos:/app/todo-projects
environment:
    - TUDUDI_TODO_ROOT=/app/todo-projects
```

**Never mount `~/Dev` or any folder that holds secrets** (`.env` files, keys, credentials). The server only ever reads and writes files named `TODO.md`, but a mount exposes everything in it to the container. The recommended source is a folder of git clones kept up to date by a sidecar or a cron job (`git pull` on a schedule); the server never runs git itself.

## What is read

```markdown
# Project title (ignored)

## Now

- [ ] Ship the thing
      a note on the following indented lines
    - nested sub-bullets stay in the note

## Next

- Write docs
- [x] Already done

## Ideas

- Maybe a widget

## Done

- Set up the repo
```

- A `## ` heading starts a section (`Now`, `Next`, `Ideas`, `Done`, `Dropped`, or any other). Text before the first one is ignored. `###` and deeper headings, paragraphs and fenced code blocks are ignored.
- Each **top-level** bullet (`-`, `*` or `+` at column 0) is a task. Indented lines, nested bullets and blank lines between them belong to the bullet above and become the task's **note**. A bullet with no text is not a task.
- The **name** is the first line with its Markdown stripped (emphasis, code, links, strikethrough). `- [ ]` / `- [x]` checkboxes are read.
- **Done** = a checked box, or a bullet in a `## Done` section. A bullet in `## Dropped` becomes archived.
- The section name becomes a **tag** on the task (`Now`, `Next`, ...), so it can be filtered like any tag, on the web and on Android.
- CRLF files, a missing final newline and a UTF-8 BOM are handled. Files in another encoding are left untouched (Cadence refuses to write them).

Each folder gives one project, named after the folder, marked `source_type = 'todo_md'` with `source_path = '<folder>/TODO.md'`. Folders whose name starts with `.`, folders without a `TODO.md`, and sub-folders deeper than one level are ignored.

## How tasks keep their identity

A task is matched to its bullet by section + normalised first line + occurrence index (the second identical bullet in a section is occurrence 1). The key is stored on the task (`tasks.source_key`, with `source_section`), so re-reading updates rows in place and never duplicates:

- reordering, editing the note, checking a box or adding unrelated lines keeps every task;
- a bullet **moved to another section** keeps its row when its text is unique among the unmatched bullets (the section tag follows);
- a bullet whose **text is edited** is a new task and the old one is removed;
- a task whose bullet is gone from the file is **removed** from Cadence (with its Cadence-side links).

Nothing is deleted because a file is unreachable: if the root is missing or a file cannot be read, that pass is skipped and reported.

## When it is read

- At start-up, then every **30 seconds** (size and modification time of each `TODO.md`; this works on bind mounts that do not emit file events), and sooner when `fs.watch` reports a change.
- **Reread** button on the project page, or `POST /api/todo-md/rescan` (only the account that owns the projects): reads everything now and returns `{ projects, created, updated, removed, errors }`.
- `GET /api/todo-md/status`: `{ enabled, last_scan }`.

## What can be done from Cadence

| Action                                   | Result                                                                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a task to the project (web, Android) | Appended as a `- ` bullet at the end of `## Next` (section created when missing). The web "+ Add task" field has a **Add to** menu (Now / Next / Ideas); the API takes `todo_section`. A note is written as indented lines. |
| Check a task off                         | Writes `[x]` on the bullet (adds `[x] ` when it had no box). Unchecking writes `[ ]`. A task in `## Done` or `## Dropped` cannot be reopened from Cadence: move it in the file.                                             |
| Anything else on a task                  | Refused (`403`, `todo_md_read_only`; sync ops are rejected as `read_only`). The web hides edit controls and shows a **TODO.md** badge.                                                                                      |
| Project: rename, delete, complete        | Refused. Area, colour, pin and tags stay editable (they are not in the file).                                                                                                                                               |

Today-plan membership, comments, relations and attachments are Cadence-side data and are not blocked.

### How a write is made

The file is re-read just before writing, the new content goes to a temp file in the same directory (same mode), is flushed, and replaces the original with an atomic rename only if the original is still byte-for-byte what was read; otherwise it starts again, up to 3 times (`409 file_conflict` after that). Only the inserted bytes change: other lines, line endings, the trailing newline and a BOM are preserved. Reads and writes of one project are serialised inside the server, so a task added while a scan runs is not imported twice.

### Safety

- Paths are resolved with `realpath` and must stay inside the root; a symlinked folder or `TODO.md` that leaves the root, or a `TODO.md` that points at a file not named `TODO.md`, is refused. The stored `source_path` is validated again before every write.
- No other file in the folder is ever read or written.
- Two server processes on one PostgreSQL database share the scan through a job lock; writes are serialised per process only, so run one server when the folder is writable.

## Offline sync and Android

These are ordinary projects and tasks, so they reach devices through `/api/v1/sync`. The project carries a server-written field `source_type` (listed under `server_fields` in `/sync/meta`; a push that names it is rejected as `unknown_field`).

A task created on a device inside a TODO.md project goes through the same server path: the bullet is written to the file and the row keeps the uid the device chose. Other edits and deletes of mirrored rows (and deleting or renaming the project) are rejected as `read_only`; checking a task is accepted and written to the file.

Android does not yet read `source_type`, so it shows these tasks like any others and lists a rejected edit in its failed-operations journal.

## Known limits

- A folder renamed or removed leaves its old project in place (nothing is deleted while a file is missing); remove it by hand.
- Editing a bullet's text creates a new task, so Cadence-side data on the old one is lost.
- A TODO.md that is mounted as a single file (not a folder) cannot be replaced atomically; mount the folder.
