# Offline Sync

The sync API lets native clients (the Android app, the Linux desktop app) keep a full local copy, work offline, and send their changes later without duplicates. It lives in `backend/modules/sync/` under `/api/v1/sync` (also served under `/api/sync`) and uses the normal authentication. Native clients use one `tt_` API key per device. CalDAV sync is a separate subsystem, documented in [11-caldav-sync.md](11-caldav-sync.md).

## What syncs

`backend/modules/sync/registry.js` lists every syncable entity: its fields and its references. References are exposed by uid, never by numeric id (for example `project_uid`, `parent_task_uid`). `schema_version` 1 covered `task`, `project`, `area`, `tag`, `note` and `inbox_item`; version 2 adds the fifteen Cadence habit entities below.

To add an entity:
1. Add an entry to the registry.
2. Add a `field_clocks` column to its table (migration + model).
3. Pass the model to `install()` in `backend/models/index.js`.

The protocol stays the same.

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
| `GET /sync/pull?cursor=&limit=` | Changes after `cursor`, in order: `{seq, entity, uid, op: upsert/delete, data, op_id}`, plus the next `cursor` and `has_more`. |
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
- **The client picks the uid.** It must be 8 to 64 characters among `[A-Za-z0-9_-]`. A uid that belongs to another account is rejected.
- **Idempotence.** The result of each op is stored in `sync_ops` per `(user, op_id)`. Pushing the same op again returns the same result and applies nothing.
- **Merge field by field.** Every field carries a hybrid logical clock in `field_clocks` (`<ms 13 digits>-<counter 4 digits>-<node>`, compared as strings). A newer or equal clock wins.
  - An older value comes back as `conflict` with `rejected_fields`, and is kept in `sync_conflicts`.
  - A web edit stamps its fields with the server clock, which stays ahead of every clock it has accepted. So a web edit wins over an older offline edit.
  - A clock more than 24 h in the future is rejected.
- **Delete wins.** An edit to a deleted row is rejected (`deleted`) and does not bring it back.
- **Echo.** A pulled change carries the `op_id` that produced it, so a device can skip its own writes.
- **Isolation.** Each user pulls only their own journal, and a reference must point to one of their own rows. `scope_key` is kept for sharing projects later.
- **Tags** sync as `tag_uids` lists on tasks, projects and notes, merged as a whole. A tag change from any path re-journals the parent.
- **Recurring tasks.** `{op_id, entity: "task", uid, action: "complete_occurrence" | "skip_occurrence", occurrence_date, hlc}` acts on the occurrence due at `occurrence_date`. An occurrence already recorded is answered `applied` without moving the task again, so two offline devices completing the same day advance it once. An occurrence that is not the current due date is rejected (`occurrence_not_due`).
- **Account erasure** deletes the journal, the ops and the conflicts.

## Not yet covered

- Journal compaction.
- Shared projects.

See [fork/PLAN-clients-sync.md](fork/PLAN-clients-sync.md).
