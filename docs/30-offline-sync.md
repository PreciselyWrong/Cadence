# Offline Sync

The sync API lets native clients (the Android app, the Linux desktop app) keep a full local copy, work offline, and send their changes later without duplicates. It lives in `backend/modules/sync/` under `/api/v1/sync` (also served under `/api/sync`) and uses the normal authentication. Native clients use one `tt_` API key per device. CalDAV sync is a separate subsystem, documented in [11-caldav-sync.md](11-caldav-sync.md).

## What syncs

`backend/modules/sync/registry.js` lists every syncable entity: its fields and its references. References are exposed by uid, never by numeric id (for example `project_uid`, `parent_task_uid`). `schema_version` 1 covered `task`, `project`, `area`, `tag`, `note` and `inbox_item`; version 2 adds the fifteen Cadence habit entities below; version 3 adds the `goal` entity, a `goal_uid` reference on `task` and `project`, and the project field `next_task_uid`.

To add an entity:
1. Add an entry to the registry.
2. Add a `field_clocks` column to its table (migration + model).
3. Pass the model to `install()` in `backend/models/index.js`.

The protocol stays the same.

### Goals

| Entity | Fields | References | Notes |
|---|---|---|---|
| `goal` | `title`, `why`, `horizon` (`month`, `quarter`, `season`, `year`), `target_date`, `status`, `color`, `bucket` (`have`, `be`, `do`, or null) | `area_uid`, `parent_goal_uid` | a goal with a parent is a key result (one level only); rows with a `bucket` are the bucket list |

`task` and `project` gain the reference `goal_uid` (their existing goal link, which may now point at a key result), and `project` gains the field `next_task_uid` (uid of an open task of that project, or null; the server clears it when the task is done, deleted or moved). A push is rejected as `invalid_hierarchy` when a goal would have a parent that is not the user's own, a parent that itself has a parent, key results of its own, or a bucket together with a parent. Deleting a goal on a device deletes its key results and clears the goal link of their projects and tasks, as the web does. Progress (`done/total` of the linked items) is not synced: a client computes it from the tasks and projects it holds.

### Cadence habit entities

Listed in `GET /sync/meta` in dependency order. Field names, types, units and rules of each one are in [21-habits.md](21-habits.md#cadence-habits): that page is the contract the Android sync and the web UI are built from. Their wire names are the snake_case of the Room properties (a Room `habitId` is the reference `habit_uid`).

| Entity | References | Notes |
|---|---|---|
| `habit_group` | | uid unique **per user** (`uid_scope: "user"` in the metadata): `group-day` etc. exist for every user |
| `habit` | `group_uid` | deleting it deletes the rows below, each with a tombstone |
| `habit_goal`, `habit_schedule` | `habit_uid` | versions, valid from `effective_from` |
| `habit_entry` | `habit_uid` | `local_date` + `observed_zone_id` kept as lived |
| `habit_pause`, `habit_quick_value`, `habit_reminder` | `habit_uid` | |
| `habit_timer`, `health_connect_rule`, `learned_question_settings` | `habit_uid` | one per habit, uid = the habit's uid |
| `health_connect_import` | `habit_uid` | uid = the imported entry's id |
| `abstinence_log`, `alcohol_consumption`, `learned_question_record` | `habit_uid` | the last two are unique per (habit, date) |

Widget configuration and reminder snoozes are not synced. Rows are validated against the rules of the Kotlin domain (rejected as `invalid_value[:field]`, `missing_field:<field>`, `duplicate_key`); push parents before children.

## Endpoints

| Endpoint | Use |
|---|---|
| `GET /sync/meta` | Schema version, capabilities, entities with their fields and references. |
| `GET /sync/snapshot?entity=&after=&limit=` | First download of a device, page by page. It returns `cursor`, which the device then pulls from. |
| `GET /sync/pull?cursor=&limit=` | Changes after `cursor`, in order: `{seq, entity, uid, op: upsert/delete, data, op_id}`, plus the next `cursor` and `has_more`. `410 {error: "reset_required"}` when the journal was compacted past `cursor` (see Compaction): take a new snapshot. |
| `POST /sync/push` | `{ops: [...]}`, up to 500, applied in order. Every op gets its own result, and a bad op never fails the batch. |

A pushed op:

```json
{ "op_id": "dev1-000042", "entity": "task", "uid": "c0ffee-1234-abcd", "action": "upsert",
  "fields": { "name": { "value": "Call Paul", "hlc": "1761750000000-0003-dev1" },
              "project_uid": { "value": "p-home-0001", "hlc": "1761750000000-0003-dev1" } } }
```

`{op_id, entity, uid, action: "delete", hlc}` deletes a row.

## Rules

- **Journal.** Every write goes through model hooks, from any path (web, MCP, Telegram, CalDAV, imports), and each one adds a row to `sync_changes`. A bulk write gets individual hooks. The cursor is the row id, so it never depends on device clocks. A deletion leaves a tombstone.
- **Journal order.** A pull never looks below its cursor again, so a user's journal ids must become visible in the order they were handed out. SQLite has a single writer, which gives that order. On PostgreSQL every journal insert first takes a per-user advisory lock held until its transaction commits (`db-dialect.withJournalOrder`): the next id is handed out only once the previous holder is visible, so an entry committed late can never sit below a cursor already returned. A lone insert runs in its own short transaction with a 10 s `lock_timeout`, so a write made outside the caller's own open transaction fails instead of hanging.
- **The client picks the uid.** It must be 8 to 64 characters among `[A-Za-z0-9_-]`. A uid that belongs to another account is rejected.
- **Idempotence.** The result of each op is stored in `sync_ops` per `(user, op_id)`. Pushing the same op again returns the same result and applies nothing.
- **Concurrent pushes.** Ops on the same row (`entity` + `uid`, plus the user for per-user uids) wait for each other in the server process, so two parallel pushes never merge onto a stale read. On PostgreSQL the merge of an upsert also runs in a transaction that reads the row `FOR NO KEY UPDATE` (`db-dialect.withRowLock`), which serializes it against other server processes; a create that loses the race to another process is merged again onto that process's row. SQLite runs without that transaction: its single write lock would block the writes the merge makes outside it, and there is one server process. Rows mirrored from a TODO.md file, deletes and occurrence ops are not run inside that transaction (their writes go through code that takes its own).
- **Merge field by field.** Every field carries a hybrid logical clock in `field_clocks` (`<ms 13 digits>-<counter 4 digits>-<node>`, compared as strings). A newer or equal clock wins.
  - An older value comes back as `conflict` with `rejected_fields`, and is kept in `sync_conflicts`.
  - A web edit stamps its fields with the server clock, which stays ahead of every clock it has accepted. So a web edit wins over an older offline edit.
  - A clock more than 24 h in the future is rejected.
- **Delete wins.** An edit to a deleted row is rejected (`deleted`) and does not bring it back.
- **Echo.** A pulled change carries the `op_id` that produced it, so a device can skip its own writes.
- **Isolation.** Each user pulls only their own journal, and a reference must point to one of their own rows. `scope_key` is kept for sharing projects later.
- **Tags** sync as `tag_uids` lists on tasks, projects and notes, merged as a whole. A tag change from any path re-journals the parent.
- **Recurring tasks.** `{op_id, entity: "task", uid, action: "complete_occurrence" | "skip_occurrence", occurrence_date, hlc}` acts on the occurrence due at `occurrence_date`. An occurrence already recorded is answered `applied` (`duplicate: true`) without moving the task again, so two offline devices completing the same day advance it once. Before moving the task, the server claims the occurrence with a row `occurrence/<task id>/<date>` in `sync_ops` (a client `op_id` cannot contain `/`); the unique `(user_id, op_id)` index makes the claim atomic even between server processes, and a lost claim is answered as a duplicate. An occurrence that is not the current due date is rejected (`occurrence_not_due`) and its claim released, so it can be completed once it comes due.
- **Account erasure** deletes the journal, the ops and the conflicts.

## Compaction

A daily job (03:30 UTC, `backend/modules/sync/compaction.js`, one process at a time through `withJobLock`; off in tests and with `DISABLE_SCHEDULER=true`) trims `sync_changes` for every entity, Cadence habit entities included:

- An entry older than the retention that has a later entry for the same row is removed: a device pulling later gets the full row from the later entry.
- A tombstone (the latest entry of a deleted row) is kept for the retention, then removed. Before removing them, the server records the highest removed tombstone id of each user (`settings` key `sync_journal_purged_through:<user id>`). A pull from below that id answers `410 {error: "reset_required"}`, since the device may have missed a delete: it takes a new snapshot, whose cursor is never below that id.
- The retention is `CADENCE_SYNC_JOURNAL_RETENTION_DAYS` days (default 30). `GET /sync/meta` lists the capability `journal_compaction`.

Once a tombstone is gone, "delete wins" no longer holds for that row: a device offline longer than the retention that pushes an edit to it creates it again.

## Not yet covered

- Shared projects.

See [fork/PLAN-clients-sync.md](fork/PLAN-clients-sync.md).
