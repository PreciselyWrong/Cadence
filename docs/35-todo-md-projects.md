# TODO.md projects (fork)

A folder on the server holds `TODO.md` files, one per sub-folder, and you choose which project follows which file (web: project info; Android: the project's menu). A `TODO.md` can also live in a **git repository** (Gitea, GitHub): the server clones it, and edits are committed and pushed ([Git repositories](#git-repositories)). The **file stays the source of truth** for its lines, so it can be edited anywhere at any time. The project stays an ordinary project: only tasks tagged `code` go to and come from the file, and every other task lives in Cadence alone ([Mixed projects](#mixed-projects)). Module: `backend/modules/todo-md/`.

**Related:** [Offline sync](30-offline-sync.md), [Projects](06-projects.md), [Backups](backups.md)

## Setup

Off unless `TUDUDI_TODO_ROOT` is set to a directory the server can read and write.

| Variable                 | Meaning                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `TUDUDI_TODO_ROOT`       | Root folder, for example `/app/todo-projects`. Each direct sub-folder with a `TODO.md` can be linked. |
| `TUDUDI_TODO_USER_EMAIL` | Account the projects belong to. Default: the first administrator, else the first account.            |

In Docker, bind-mount a **dedicated** folder read-write (see the commented example in `docker-compose.yml`):

```yaml
volumes:
    - /mnt/user/appdata/cadence-todos:/app/todo-projects
environment:
    - TUDUDI_TODO_ROOT=/app/todo-projects
```

**Never mount `~/Dev` or any folder that holds secrets** (`.env` files, keys, credentials). The server only ever reads and writes files named `TODO.md`, but a mount exposes everything in it to the container. Two ways to fill the dedicated folder:

- **A two-way sync of just those files**, for working copies that are not always pushed: [`scripts/todo-md-sync.sh`](../scripts/todo-md-sync.sh) (see its header) copies the `TODO.md` of every sub-folder of a work folder, minus an exclusion list, to and from the mounted folder, merging edits line by line.
- **[Git repositories](#git-repositories)**: the server clones each one itself and nothing is mounted.

Mount the folder, never a single file: a write replaces the file, which a single-file bind mount cannot follow.

## Choosing which project follows which file

A file feeds nothing until a project follows it: Cadence creates no project by itself.

| Call (account that owns the files)         | Result                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/todo-md/files`                   | `{ files: [{ folder, path, project_uid, project_name }] }`                                                                                        |
| `POST /api/todo-md/projects/<uid>/link`    | Body `{ "folder": "..." }`. The project follows that file, which is read at once. `409` if the project or the file is already taken.              |
| `POST /api/todo-md/projects/<uid>/unlink`  | The project stops following it. Its tasks stay as ordinary tasks and the file is not touched. Linking again matches them back by name.            |

## Mixed projects

- Tasks read from the file carry the tag **`code`**, added to their other tags and put back if removed. The section (`Now`, `Next`, ...) is kept on the task (`source_section`), not as a tag.
- A task without `code` stays in Cadence: nothing reaches the file and it is edited as usual.
- A task that gets `code`, by any route (web, device, MCP), is written to `## Next` by the next pass, at most 30 seconds later, and then follows the file. Closed and recurring tasks are not written. Its note moves to the file with it.
- A task from the file is read-only here, whichever client or MCP asks; only its check box can change. The lock is per task, on the server, the web and Android.
- A linked project can be renamed. It cannot be deleted or completed with its tasks: unlink it first.
- The outline view of a linked project stays read-only for all its tasks; the list view edits Cadence tasks normally.

## Git repositories

Each repository listed in `TUDUDI_TODO_REPOS` creates and follows one project, named after its slug and keeping that name (`source_path = 'git:<slug>'`). The server clones it, reads its `TODO.md` like a folder's, and turns a task added or checked off in Cadence (web, Android) into a commit **by `Cadence <cadence@localhost>`** pushed to the branch. A push to the repository is read back through a webhook, and every **5 minutes** in any case. Module: `backend/modules/todo-md/repos.js`, `git.js`, `webhook.js`.

| Variable                                 | Meaning                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `TUDUDI_TODO_REPOS`                      | Slugs, comma-separated: `cadence,notes`. Letters, digits, `-`, `_`.                                                           |
| `TUDUDI_TODO_REPO_<SLUG>_URL`            | Clone URL, `https://...` or `git@host:owner/repo.git`. No credentials in it. `<SLUG>`: the slug in capitals, `-` becomes `_`. |
| `TUDUDI_TODO_REPO_<SLUG>_BRANCH`         | Branch to read and push. Default `main`.                                                                                      |
| `TUDUDI_TODO_REPO_<SLUG>_PATH`           | File in the repository. Default `TODO.md`.                                                                                    |
| `TUDUDI_TODO_REPO_<SLUG>_TOKEN`          | HTTPS: access token with write access to the repository. Given to git through `GIT_ASKPASS`, never in a URL or argument.      |
| `TUDUDI_TODO_REPO_<SLUG>_USERNAME`       | HTTPS user name sent with the token. Default `x-access-token` (accepted by GitHub and Gitea).                                 |
| `TUDUDI_TODO_REPO_<SLUG>_SSH_KEY`        | SSH: the private key itself (`\n` for line breaks is accepted) or the path of a key file. Written `0600` in the clone folder. |
| `TUDUDI_TODO_REPO_<SLUG>_WEBHOOK_SECRET` | Secret of the push webhook. Without it the webhook answers `404` and only the 5-minute pass reads pushes.                     |
| `TUDUDI_TODO_GIT_DIR`                    | Where the clones go. Default `<database folder>/todo-repos` (`/app/db/todo-repos` in Docker, inside the database volume).     |

A slug with a missing URL, a branch or path that is not valid (`..`, absolute, `.git/...`, leading `-`) or a command transport (`ext::`) is left out and logged at start-up. `TUDUDI_TODO_ROOT` is not needed for repositories; both can be used together.

### Setting up a repository

1. **Access**, one of:
    - **Deploy key (SSH, recommended)**: `ssh-keygen -t ed25519 -N '' -f cadence-todo -C cadence`. Gitea: repository → Settings → Deploy keys → Add key, paste `cadence-todo.pub`, tick **Enable write access**. GitHub: repository → Settings → Deploy keys → Add deploy key, tick **Allow write access**. Then `URL=git@host:owner/repo.git` and `SSH_KEY=` the content (or path) of `cadence-todo`. The host key is accepted the first time and kept in `<git dir>/.ssh/known_hosts`; after that a changed host key is refused.
    - **Token (HTTPS)**: Gitea: user Settings → Applications → token with `write:repository`. GitHub: fine-grained token limited to the repository, **Contents: Read and write**. Then `URL=https://host/owner/repo.git` and `TOKEN=`.
2. **Webhook** (push events, JSON), URL `https://<cadence>/api/todo-md/webhook/<slug>`, secret = `WEBHOOK_SECRET` (`openssl rand -hex 32`):
    - Gitea: repository → Settings → Webhooks → Add webhook → Gitea, method POST, content type `application/json`, secret, trigger **Push events**, branch filter = the branch.
    - GitHub: repository → Settings → Webhooks → Add webhook, content type `application/json`, secret, **Just the push event**.
    - The webhook must reach the server: from a forge on the tailnet this is direct; from github.com it needs a public route to that one path (e.g. Tailscale Funnel or a Cloudflare tunnel limited to `/api/todo-md/webhook/*`). Without it, the 5-minute pass still reads pushes.
3. Restart Cadence; the project appears after the first clone. `GET /api/todo-md/status` lists the repositories for the owner.

The webhook checks the HMAC-SHA256 of the raw body (`X-Hub-Signature-256: sha256=...` from GitHub, `X-Gitea-Signature` from Gitea) with a constant-time comparison: `401` on a missing or wrong signature, `404` for an unknown slug or one without a secret, `202` for a push to another branch (ignored), `200` once read.

### How a repository write is made

Under the project's queue: fetch the branch (`--depth 1`), reset the clone to it (a local commit is never kept), apply the one edit to the file as it is **now** (same keyed edits as for a folder: append a bullet, set a box), commit, push. A rejected push (someone pushed in between) starts again from the fetch, up to 3 times. So edits made on both sides are both kept: an edit in Cadence lands on top of whatever the repository holds.

| Case                                                                          | Result                                                                                                               |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The bullet changed or vanished in the repository (check, uncheck)             | Nothing is written. `409 todo_md_conflict`; the project shows the repository's state and the edit stays **pending**. |
| The repository cannot be reached (network, credentials, push refused 3 times) | Nothing is written. `503 todo_md_repo_unreachable`; the edit stays **pending**, nothing is deleted.                  |
| A read fails                                                                  | The project keeps its tasks; `last_error` is set until the next successful read.                                     |

Pending edits are kept in `todo_md_repos.pending` (with the last commit read, `head_sha`, and `synced_at`). The project page shows "Synced with <repo> · 3 minutes ago", or the conflict / waiting edits with **Retry** (`POST /api/todo-md/repos/<slug>/retry`: replays them in order, drops the ones that apply) and **Discard** (`POST .../discard`: forgets them and reads the repository again). Both, and the repositories in `GET /api/todo-md/status`, are for the owner account only.

Git runs with no machine or user configuration (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`), no prompt, no hooks, no signing, and only the `file`, `git`, `http(s)` and `ssh` transports; the token and key never appear in arguments, URLs, logs or stored errors. The file path is resolved inside the clone: a `TODO.md` that is a symlink leading out of the repository or into `.git` is refused. The Docker image ships `git` and `openssh-client`.

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
- **Done** = a checked box, or a bullet in a `## Done` section. A bullet in `## Dropped` becomes archived. A bullet first read closed has no completion date (it is unknown), so it stays out of "done today" and the statistics; a bullet closed later takes the file's date.
- Each task carries the `code` tag ([Mixed projects](#mixed-projects)); its section is kept in `source_section`.
- CRLF files, a missing final newline and a UTF-8 BOM are handled. Files in another encoding are left untouched (Cadence refuses to write them).

A project following a file is marked `source_type = 'todo_md'` with `source_path = '<folder>/TODO.md'`. Folders whose name starts with `.`, folders without a `TODO.md`, and sub-folders deeper than one level are ignored.

## How tasks keep their identity

A task is matched to its bullet by section + normalised first line + occurrence index (the second identical bullet in a section is occurrence 1). The key is stored on the task (`tasks.source_key`, with `source_section`), so re-reading updates rows in place and never duplicates:

- reordering, editing the note, checking a box or adding unrelated lines keeps every task;
- a bullet **moved to another section** keeps its row when its text is unique among the unmatched bullets (the section tag follows);
- a bullet whose **text is edited** is a new task and the old one is removed;
- a task whose bullet is gone from the file is **removed** from Cadence (with its Cadence-side links);
- a bullet with the same name as an open or closed task tagged `code` and not yet in the file adopts that task.

Nothing is deleted because a file is unreachable: if the root is missing or a file cannot be read, that pass is skipped and reported.

## When it is read

- Folders: at start-up, then every **30 seconds** (size and modification time of each `TODO.md`; this works on bind mounts that do not emit file events), and sooner when `fs.watch` reports a change.
- Repositories: at start-up, on each signed push webhook, then every **5 minutes**.
- **Reread** button on the project page, or `POST /api/todo-md/rescan` (only the account that owns the projects): reads every folder and repository now and returns `{ projects, created, updated, removed, errors }`.
- `GET /api/todo-md/status`: `{ enabled, last_scan, repos }`; `repos` (owner only, else `[]`) gives per repository `slug`, `repo` (host/path, no credentials), `branch`, `path`, `project_uid`, `webhook`, `head_sha`, `synced_at`, `last_error`, `pending`.

## What can be done from Cadence

| Action                                   | Result                                                                                                                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a task tagged `code` (web, Android)  | Appended as a `- ` bullet at the end of `## Next` (section created when missing). The web "+ Add task" field has an **Add to** menu (Cadence only / Now / Next / Ideas); the API takes `todo_section`. A note is written as indented lines. |
| Add a task without `code`                | Stays in Cadence.                                                                                                                                                                                                           |
| Check a task off                         | Writes `[x]` on the bullet (adds `[x] ` when it had no box). Unchecking writes `[ ]`. A task in `## Done` or `## Dropped` cannot be reopened from Cadence: move it in the file.                                             |
| Anything else on a task                  | Refused (`403`, `todo_md_read_only`; sync ops are rejected as `read_only`). The web hides edit controls and shows a **TODO.md** badge.                                                                                      |
| Project: delete, complete                | Refused while it follows a file. Rename is allowed, except for a repository project. Area, colour, pin and tags stay editable.                                                                                              |

Today-plan membership, comments, relations and attachments are Cadence-side data and are not blocked.

### How a write is made

The file is re-read just before writing, the new content goes to a temp file in the same directory (same mode), is flushed, and replaces the original with an atomic rename only if the original is still byte-for-byte what was read; otherwise it starts again, up to 3 times (`409 file_conflict` after that). Only the inserted bytes change: other lines, line endings, the trailing newline and a BOM are preserved. Reads and writes of one project are serialised inside the server, so a task added while a scan runs is not imported twice.

### Safety

- Paths are resolved with `realpath` and must stay inside the root; a symlinked folder or `TODO.md` that leaves the root, or a `TODO.md` that points at a file not named `TODO.md`, is refused. The stored `source_path` is validated again before every write.
- No other file in the folder is ever read or written.
- Two server processes on one PostgreSQL database share the scan through a job lock; writes are serialised per process only, so run one server when the folder is writable.

## Offline sync and Android

These are ordinary projects and tasks, so they reach devices through `/api/v1/sync`. The project carries a server-written field `source_type` (listed under `server_fields` in `/sync/meta`; a push that names it is rejected as `unknown_field`).

A task created on a device with the `code` tag inside a TODO.md project goes through the same server path: the bullet is written to the file and the row keeps the uid the device chose. Without the tag it is an ordinary task. Other edits and deletes of mirrored rows (and deleting the project, or renaming a repository project) are rejected as `read_only`; checking a task is accepted and written to the file.

Tasks carry a server-written `source_key` (Room `tasks.sourceKey`, base v14): a task with one shows a **TODO.md** badge, its detail sheet is read-only, and swipe, long-press menu and the check box only offer done / reopen. The project's menu has **Fichier TODO.md** while the server offers files to the account (`ui/TodoMdFileDialog.kt`, read online).

On a sync push, a check or an added task that cannot reach a git repository is answered `rejected` with reason `todo_md_conflict` (the bullet changed in the repository) or `todo_md_repo_unreachable` (the edit stays pending on the server). Android says so in the sync line ("La ligne a changé dans le dépôt : rien n'a été écrit (TODO.md)." / "Dépôt injoignable : la modification attend sur le serveur (TODO.md).") and in Settings › Synchronisation, instead of a bare count. The project page of a repository project shows the same status line as the web, read online from `GET /api/v1/todo-md/status` every 30 s (matched by `project_uid`), with **Réessayer** / **Abandonner** while edits are pending (`model/TodoMdRepos.kt`, `todomd/TodoMdClient.kt`, `ui/TodoMdRepoLine.kt`); offline or for another account nothing is shown.

## Known limits

- A folder renamed or removed leaves its project linked, with its tasks (nothing is deleted while a file is missing); choose another file or none.
- Editing a bullet's text creates a new task, so Cadence-side data on the old one is lost.
- A TODO.md that is mounted as a single file (not a folder) cannot be replaced atomically; mount the folder.
- Repositories: only adding a task and checking / unchecking one are written. Editing a task's text or moving it to another section from Cadence is not offered: the bullet's text is its identity key, so a rename would replace the task (and lose its Cadence-side data); edit those in the repository.
- Repository writes are serialised per server process; a second process pushing at the same time is handled by the rejected-push retry.
- A repository removed from `TUDUDI_TODO_REPOS` leaves its project in place; remove it by hand.
