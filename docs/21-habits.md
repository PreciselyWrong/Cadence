# Habits

Habits are Cadence habits: the model of the Android app (goal and schedule versions, limits, pauses, timers, groups), stored on the server so that every device and the web read and write the same data. The pages `/habits` and `/habit/:uid` show them ([Web screens](#web-screens)); the API is `/api/cadence/*` ([REST](#rest)); the phone syncs them through the [offline sync](30-offline-sync.md). The MCP habit tools use the same operations ([MCP](#mcp)).

A habit is not a task: it never appears in a task list, and it collects entries, not completions. Reminders of a habit ring on the phone from its own alarms (`habit_reminder` rows are synced); the server also reads them to add an in-app notification, by default the only thing it sends ([Habit reminders](36-notifications.md#habit-reminders)).

## Habits from before Cadence habits

Until the Cadence habits, habits were tasks with `habit_mode = true`, served by `/api/habits` with their own engine and a reminder job. That module is removed: no `/api/habits` route, no habit engine for those tasks. The reminder job is back, rebuilt on the Cadence habits (`habit_reminders` scheduler job, [Habit reminders](36-notifications.md#habit-reminders)).

What stays, because old installs still have the data:

- **The columns.** `tasks.habit_*`, `tasks.habit_mode`, `recurring_completions.value` / `note` / `skipped` and the migrations that added them are untouched (published migrations are never edited, and nothing is dropped).
- **The import.** At start-up, and on `POST /api/cadence/import-legacy`, every task with `habit_mode` that has no Cadence habit yet becomes one ([Importing Tududi habits](#importing-tududi-habits)). `CADENCE_SKIP_LEGACY_HABIT_IMPORT=true` turns the start-up run off.
- **The rows.** They are not deleted after the import. They stay out of every task list instead: All tasks, Today, Upcoming, the calendar, the planner and the Today metrics skip `habit_mode` tasks. Review, the spreadsheet export, Google sync, webhook summaries and Everyone already did.
- **Data export and import** (`userDataTransfer`) keep carrying the `habit_*` columns of those tasks.
- **CalDAV** still maps `habit_mode` tasks to VTODO items like any other task.
- **The `habitReminders` notification preference** was dead for a while and is the type key of the new server-side habit reminders again (in-app on, every other channel off by default).

Onboarding starters create Cadence habits (a yes/no every day, on chosen weekdays, or once a week).

## Cadence habits

The rules (period status, streaks, statistics) are those of the app's pure-Kotlin domain (`android/domain`); the server runs a JavaScript twin of them and both are proven against the same fixtures.

Where to look:

| What | Where |
|---|---|
| Entities and their fields | this section, generated from `backend/modules/habits/cadence/schema.js` |
| Sync of the entities | [30-offline-sync.md](30-offline-sync.md), `backend/modules/sync/registry.js` |
| Rule engine | `backend/modules/habits/cadence/` |
| Golden fixtures | `fixtures/habits/` (format in its README) |
| REST routes | `backend/modules/habits/cadence/routes.js` |
| Import of the old habits | `backend/modules/habits/cadence/operations/importLegacy.js` |

### Conventions

- **Field names** are the snake_case of the Room properties of `android/data` (`localDate` is `local_date`). A Room `habitId` is the reference `habit_uid`: references always travel as uids, never numeric ids. Room `id` is the row's `uid`.
- **Quantities** are integers in *minor units*: the canonical unit of the dimension times a scale (seconds for time, metres, grams, millilitres, counts). A 30-minute goal is `target_minor: 1800` with `unit_scale_to_canonical: 60`. Values stay safe JavaScript integers (at most 2^53 - 1); sending a decimal is `invalid_value`. Money (`abstinence_spending_minor`) is in minor currency units.
- **Civil dates** are `YYYY-MM-DD` strings. They are never converted: an entry keeps the `local_date` and `observed_zone_id` it was lived in.
- **Instants** (`occurred_at`, `recorded_at`, `running_since`, ...) are ISO 8601 strings with a `Z` or an offset. The server returns them as UTC with milliseconds (`2026-10-05T21:30:00.000Z`). Room's `...EpochMs` fields map to them one to one.
- **Enums** travel as the Kotlin enum names (`AT_LEAST`, `MONDAY`, ...). Lists (`active_days`, `days_of_week`, `muted_weekdays`, `exercise_types`) are comma-separated strings, as in Room.
- **Versions.** The goal and the schedule of a habit are lists of versions (`habit_goal`, `habit_schedule`), each valid from its `effective_from`. The version in force on a day is the one with the latest `effective_from` not after that day; among equal dates the last one written wins. A change of goal appends a version; the past keeps the version that produced it.
- **Deletion** is a tombstone in the sync journal (`op: "delete"`); there is no soft-delete column.
- **Local only** (never synced): widget configuration (`widget_configurations`, `widget_habits`) and reminder snoozes.

### Entities

Every row also carries, in the sync pull and in REST, `created_at` and `updated_at` (server times); the pull adds `field_clocks`. Required fields with a default may be left out on creation.

#### `habit_group`

Server table `habit_groups`, Room `habit_groups` (`HabitGroupEntity`). uid: a fixed id for the default groups (`group-day`, `group-morning`, `group-afternoon`, `group-evening`), a UUID otherwise; unique per user.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string(255) | yes |  |
| `start_minute` | int32 | no | minute of the day, 0-1439; both bounds null for a group available all day |
| `end_minute` | int32 | no | exclusive; smaller than the start means the range crosses midnight |
| `sort_order` | int32 | yes (default 0) |  |

#### `habit`

Server table `habits`, Room `habits` (`HabitEntity`). uid: Room `id` (UUID); unique across users.

| Field | Type | Required | Notes |
|---|---|---|---|
| `group_uid` | uid of `habit_group` | no | null means the always-available group `group-day` |
| `name` | string(255) | yes |  |
| `description` | string | no |  |
| `icon_id` | string(100) | no |  |
| `color_argb` | int32 | no | signed 32-bit ARGB, as Room `colorArgb` |
| `active` | boolean | yes (default true) |  |
| `starts_on` | date `YYYY-MM-DD` | yes (default "1970-01-01") | first day of the habit; nothing before it counts |
| `archived` | boolean | yes (default false) |  |
| `sort_order` | int32 | yes (default 0) |  |
| `client_created_at` | instant (ISO 8601 UTC) | no | Room `createdAtEpochMs`, as an instant |
| `timer_enabled` | boolean | yes (default false) | offers the timer for duration goals |
| `abstinence_profile` | NONE \| ALCOHOL \| MASTURBATION \| SMOKING \| VAPING \| CANNABIS \| CAFFEINE \| GAMBLING \| SOCIAL_MEDIA \| BEDTIME_SCREENS \| IMPULSE_SHOPPING \| PORNOGRAPHY \| CUSTOM | yes (default "NONE") |  |
| `abstinence_started_at` | instant (ISO 8601 UTC) | no | instant the abstinence began |
| `abstinence_spending_minor` | integer (JSON number, safe range) | no | money spent per `abstinence_spending_period`, in minor currency units |
| `abstinence_spending_period` | DAY \| WEEK \| MONTH | no |  |
| `abstinence_savings_currency` | string(16) | no |  |
| `alcohol_follow_up_time` | string(5) | no | `HH:mm`; set for the ALCOHOL profile |

#### `habit_goal`

Server table `habit_goal_versions`, Room `habit_goals` (`HabitGoalEntity`). uid: Room `id` (UUID); unique across users.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `target_minor` | integer (JSON number, safe range) | yes | the ideal, in minor units (canonical unit x scale); a limit's maximum; 0 for a limit of zero or a free activity |
| `period` | DAY \| WEEK \| MONTH | yes |  |
| `goal_type` | BINARY \| COUNT \| QUANTITY \| DURATION | yes (default "QUANTITY") | BINARY, COUNT, QUANTITY, DURATION |
| `unit_id` | string(100) | no |  |
| `unit_dimension` | TIME \| COUNT \| DISTANCE \| MASS \| VOLUME \| CUSTOM | no |  |
| `unit_name_fr` | string(100) | no |  |
| `unit_symbol` | string(32) | no |  |
| `unit_scale_to_canonical` | integer (JSON number, safe range) | no | minor units per unit (a minute is 60 when the canonical unit is the second) |
| `frequency_target` | int32 | no | number of distinct sessions required in the period |
| `minimum_minor` | integer (JSON number, safe range) | no | the threshold that validates the period; null when it equals the ideal; at most the target |
| `direction` | AT_LEAST \| AT_MOST \| TRACK_ONLY | yes (default "AT_LEAST") | AT_LEAST (target), AT_MOST (limit, a zero target is an abstinence), TRACK_ONLY (free activity: DAY period, target 0) |
| `progression_step` | integer (JSON number, safe range) | no | the four `progression_*` fields go together (the cap may be null) or are all null |
| `progression_cadence` | WEEKLY \| MONTHLY | no |  |
| `progression_cap_minor` | integer (JSON number, safe range) | no |  |
| `progression_starts_on` | date `YYYY-MM-DD` | no |  |
| `effective_from` | date `YYYY-MM-DD` | yes | first day this version applies to; versions are appended, never rewritten |

#### `habit_schedule`

Server table `habit_schedule_versions`, Room `habit_schedules` (`HabitScheduleEntity`). uid: Room `id` (UUID); unique across users.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `schedule_mode` | EVERY_DAY \| SELECTED_DAYS \| FLEXIBLE_PERIOD \| INTERVAL_DAYS | yes (default "SELECTED_DAYS") | EVERY_DAY, SELECTED_DAYS, FLEXIBLE_PERIOD, INTERVAL_DAYS |
| `active_days` | string(100) | yes | comma-separated `DayOfWeek` names (`MONDAY,WEDNESDAY`); at least one for SELECTED_DAYS |
| `first_day_of_week` | MONDAY \| TUESDAY \| WEDNESDAY \| THURSDAY \| FRIDAY \| SATURDAY \| SUNDAY | yes |  |
| `effective_from` | date `YYYY-MM-DD` | yes |  |
| `interval_days` | int32 | yes (default 2) | at least 2; planned every N days from the habit's `starts_on` |

#### `habit_entry`

Server table `habit_entries`, Room `habit_entries` (`HabitEntryEntity`). uid: Room `id` (UUID); unique across users.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `occurred_at` | instant (ISO 8601 UTC) | yes | the instant of the entry |
| `local_date` | date `YYYY-MM-DD` | yes | the civil date the person lived it in, kept as observed; never recomputed |
| `observed_zone_id` | string(64) | yes | IANA zone at the time of the entry |
| `value_minor` | integer (JSON number, safe range) | yes | positive, in minor units of the goal |
| `source` | string(255) | yes (default "MANUAL") | `MANUAL`, `LEARNED_QUESTION`, or `HEALTH_CONNECT:<package>` |
| `session_id` | string(100) | no | entries sharing a session count once for a frequency target |
| `note` | string | no |  |

#### `habit_pause`

Server table `habit_pauses`, Room `habit_pauses` (`HabitPauseEntity`). uid: Room `id` (UUID); unique across users.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `start` | date `YYYY-MM-DD` | yes | first paused day |
| `end_exclusive` | date `YYYY-MM-DD` | no | null for an open pause |
| `reason` | REST \| ILLNESS \| TRAVEL \| CUSTOM \| MANUAL | no | null is allowed; MANUAL is an open pause without motive |
| `reason_label` | string(255) | no | wording of a CUSTOM reason (required then) |

#### `habit_quick_value`

Server table `habit_quick_values`, Room `habit_quick_values` (`HabitQuickValueEntity`). uid: Room `id` (UUID); unique across users.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `label` | string(100) | yes |  |
| `amount_minor` | integer (JSON number, safe range) | yes |  |
| `sort_order` | int32 | yes (default 0) |  |

#### `habit_reminder`

Server table `habit_reminders`, Room `habit_reminders` (`HabitReminderEntity`). uid: Room `id` (UUID); unique across users.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `time` | string(5) | yes | `HH:mm`, local |
| `days_of_week` | string(100) | yes (default "") | comma-separated `DayOfWeek` names; empty means every day |
| `enabled` | boolean | yes (default true) |  |
| `conditional` | boolean | yes (default true) | only fires while the period is not met |

#### `habit_timer`

Server table `habit_timers`, Room `habit_timers` (`HabitTimerEntity`). uid: the habit's own uid (Room key: `habitId`).
Natural key, unique per user: `habit_uid`; a second row with the same key and another uid is rejected as `duplicate_key`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `accumulated_seconds` | integer (JSON number, safe range) | yes (default 0) | seconds of finished segments |
| `running_since` | instant (ISO 8601 UTC) | no | instant the current segment started; null when stopped. Push it together with `accumulated_seconds` |

#### `health_connect_rule`

Server table `health_connect_rules`, Room `health_connect_rules` (`HealthConnectRuleEntity`). uid: the habit's own uid (Room key: `habitId`).
Natural key, unique per user: `habit_uid`; a second row with the same key and another uid is rejected as `duplicate_key`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `exercise_types` | string | yes | comma-separated Health Connect exercise type ints, at least one |
| `data_origin_package` | string(255) | no |  |
| `enabled` | boolean | yes (default true) |  |

#### `health_connect_import`

Server table `health_connect_imports`, Room `health_connect_imports` (`HealthConnectImportEntity`). uid: the imported entry's id, `hc-<uuid>` (Room key: `recordId` + `habitId`, unique `entryId`).
Natural key, unique per user: `habit_uid` + `record_id`; a second row with the same key and another uid is rejected as `duplicate_key`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `record_id` | string(255) | yes | Health Connect record id |
| `entry_uid` | string(100) | yes | plain text, not a reference: it survives the deletion of the entry |
| `data_origin_package` | string(255) | yes |  |
| `state` | IMPORTED \| IGNORED \| DETACHED | yes | IMPORTED, IGNORED, DETACHED |

#### `abstinence_log`

Server table `abstinence_logs`, Room `abstinence_logs` (`AbstinenceLogEntity`). uid: Room `id` (UUID); unique across users.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `occurred_at` | instant (ISO 8601 UTC) | yes |  |
| `local_date` | date `YYYY-MM-DD` | yes |  |
| `observed_zone_id` | string(64) | yes |  |
| `kind` | CHECK_IN \| URGE | yes | CHECK_IN or URGE |
| `intensity` | int32 | no | 1-5 for an URGE, null for a CHECK_IN |
| `note` | string | no | at most 500 characters |

#### `alcohol_consumption`

Server table `alcohol_consumptions`, Room `alcohol_consumptions` (`AlcoholConsumptionEntity`). uid: Room `id` (UUID); unique across users.
Natural key, unique per user: `habit_uid` + `local_date`; a second row with the same key and another uid is rejected as `duplicate_key`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `local_date` | date `YYYY-MM-DD` | yes |  |
| `observed_zone_id` | string(64) | yes |  |
| `standard_drinks` | int32 | no | null when not answered yet |
| `follow_up_date` | date `YYYY-MM-DD` | no |  |
| `follow_up_notified` | boolean | yes (default false) | synced: once one device notified, the others stay quiet |
| `observed_at` | instant (ISO 8601 UTC) | no | instant of the answer |

#### `learned_question_settings`

Server table `learned_question_settings`, Room `learned_question_settings` (`LearnedQuestionSettingsEntity`). uid: the habit's own uid (Room key: `habitId`).
Natural key, unique per user: `habit_uid`; a second row with the same key and another uid is rejected as `duplicate_key`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `enabled` | boolean | yes |  |
| `ask_at` | string(5) | yes | `HH:mm`, local |
| `threshold_percent` | int32 | yes | 1-100 |
| `muted_weekdays` | string(100) | yes (default "") | comma-separated `DayOfWeek` names; empty means none |
| `silent_during_pauses` | boolean | yes (default true) |  |

#### `learned_question_record`

Server table `learned_question_records`, Room `learned_question_records` (`LearnedQuestionRecordEntity`). uid: `<habit_uid>_<local_date>` (Room key: `habitId` + `localDate`).
Natural key, unique per user: `habit_uid` + `local_date`; a second row with the same key and another uid is rejected as `duplicate_key`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `habit_uid` | uid of `habit` | yes | reference by uid; deleting the target deletes this row |
| `local_date` | date `YYYY-MM-DD` | yes |  |
| `outcome` | NO \| YES \| AMOUNT \| DISMISSED | yes | NO, YES, AMOUNT, DISMISSED |
| `value_minor` | integer (JSON number, safe range) | no | required (positive) for AMOUNT, null otherwise |
| `recorded_at` | instant (ISO 8601 UTC) | yes |  |

### Rules of the sync for habits

- **Push order.** A reference must exist: push `habit_group` before the `habit` that names it, and a `habit` before its children (`habit_uid`). The order of `GET /sync/meta` is a valid order. A pull delivers changes in journal order, so a parent always arrives before the children written after it.
- **Required fields.** A new row must carry every required field that has no default, or it is rejected (`missing_field:<field>`). An edit may carry only the fields it changes.
- **Validation.** A write that breaks a rule of the domain is rejected as `invalid_value` or `invalid_value:<field>`: a wrong type or enum, a minimum above the ideal, a limit with a minimum, a zero target on an at-least goal, a tracker that is not daily, a pause that ends before it starts, a custom pause reason without wording, an entry value that is not positive, an urge without an intensity from 1 to 5, a time that is not `HH:mm`, a progression missing one of its parts. These are the rules of `HabitGoal`, `HabitSchedule`, `HabitPause` and the other Kotlin constructors.
- **Natural keys.** `alcohol_consumption`, `learned_question_record`, `health_connect_import` and the one-per-habit rows (`habit_timer`, `health_connect_rule`, `learned_question_settings`) are unique by key. A second row with another uid is `duplicate_key`: the device should pull, adopt the existing row and drop its own. Use the deterministic uids listed above so two devices write the same row.
- **Groups.** The uid of a `habit_group` is unique per user, so every user can have `group-day`. Deleting a group sets the `group_uid` of its habits to null (the always-available group) and journals those habits; a device does the same locally.
- **Cascade.** Deleting a `habit` deletes all its rows, each with its own tombstone, in one transaction. Devices cascade locally (Room already does).
- **Timer.** `accumulated_seconds` and `running_since` are merged field by field: always push both together in the same op, so a merge never mixes two devices' halves.
- **Default groups.** The server creates the four default groups of a user the first time it needs them (first habit created from the web, `GET /cadence/groups`, import) with the oldest possible clock, so a group a device renamed or moved always wins over the server's copy.
- **Account erasure** deletes all of them.
- **Switching accounts on a device.** Habits are local first and stay on the phone when it disconnects. The Android app remembers which account (server address and user `uid`) they belong to; connected to another account, it never pushes them: their outbox is cleared, their sync is off both ways, and the app asks whether to keep them on this phone only (sync stays off with that account) or delete them (the new account's habits then arrive from a full snapshot). Reconnecting the original account resumes their sync.

### Rule engine and golden fixtures

`backend/modules/habits/cadence/` mirrors the rules of `android/domain`:

| Module | Kotlin source | Gives |
|---|---|---|
| `models.js` | `HabitModels.kt`, `GoalProgression.kt` | `buildGoal`, `buildSchedule`, `buildPause` (same `require` checks), `targetAt`, pause helpers |
| `evaluator.js` | `PeriodCalculator.kt`, `HabitEvaluator.kt` | `periodWindow`, `isPlannedOn`, `evaluate` (progress, attainment, limit status, needs attention, failure) |
| `streak.js` | `StreakCalculator.kt` | `computeStreak(habitAt, today, entries, pauses)` |
| `statistics.js` | `HabitStatisticsSummary.kt`, `HabitActivityStats.kt` | `computeSummary`, `computeActivity` |
| `timerAndGroup.js` | `HabitTimer.kt`, `HabitGroup.kt` | `elapsedSecondsAt`, `timerAttainment`, `groupIsActiveAt` |

`habitAt(date)` returns the habit as it was on that date (see Versions), so a changed goal never rewrites the past. Dates are `YYYY-MM-DD` strings and all arithmetic is on civil days.

The fixtures in `fixtures/habits/*.json` (169 cases transcribed from the Kotlin tests: evaluation, limits and free activities, minimum and ideal, progressions, pauses and trips, streaks, statistics, activity, timers, groups) are replayed by `backend/tests/unit/habits/goldenFixtures.test.js` and by `android/domain/.../GoldenFixturesTest.kt`. A rule changed on one side only fails one of them. A new rule starts with a new fixture, red on both sides.

Not mirrored yet (Kotlin only): abstinence and alcohol statistics (`AbstinenceStats`, `AlcoholStats`, savings, elapsed time), habit insights, learned-question planning, week outlook and widget logic.

### REST

For the web UI. Same data and field names as the sync; every route needs a signed-in user and only ever touches that user's rows (a uid of someone else is a `404`; creating a uid someone else owns is `409`). Prefix `/api` or `/api/v1`. Writes go through the same models and validation as the sync push, so a change made on the web reaches the devices through the journal. Errors: `400` with the code (`invalid_value:target_minor`, `unknown_field:x`, `missing_field:goal`, `duplicate_key`, `invalid_reference:group_uid`), `404`, `409`. `POST` routes accept an `Idempotency-Key` header and a client `uid`; a repeated uid of the same user answers `200` with the existing row.

| Method | Path | Purpose |
|---|---|---|
| GET | `/cadence/habits?archived=&date=` | Habits with `goal` and `schedule` in force on `date` (default today in the user's zone) and `status`: `{date, evaluation, streak}` |
| POST | `/cadence/habits` | Create a habit with its first versions: `{uid?, name, starts_on?, group_uid?, ..., goal: {target_minor, period, ...}, schedule?: {schedule_mode, active_days, ...}, effective_from?}` (`effective_from` defaults to `starts_on`, which defaults to today). `201`, or `200` for a known uid |
| GET | `/cadence/habits/:uid?date=` | The habit with `goals`, `schedules`, `pauses`, `quick_values`, `reminders`, `timer`, `health_connect_rule`, `health_connect_imports`, `abstinence_logs`, `alcohol_consumptions`, `learned_question_settings`, `learned_question_records`, and `stats: {summary, activity}` (engine output, camelCase, see the fixtures README) |
| PATCH | `/cadence/habits/:uid` | Change habit fields, including `group_uid` and `archived` |
| DELETE | `/cadence/habits/:uid` | Delete the habit and everything under it |
| GET | `/cadence/habits/:uid/{collection}` | List a collection (`entries` also takes `?from=&to=` on `local_date`) |
| POST | `/cadence/habits/:uid/{collection}` | Add a row; `habit_uid` is the route's |
| PATCH, DELETE | `/cadence/habits/:uid/{collection}/:childUid` | Edit or remove a row |
| GET, PUT, DELETE | `/cadence/habits/:uid/{single}` | One row per habit; `PUT` creates (`201`) or updates (`200`); its uid is the habit's |
| GET, POST | `/cadence/groups` | Groups (the defaults are created on first read); `POST` `{uid?, name, start_minute, end_minute, sort_order}` |
| PATCH, DELETE | `/cadence/groups/:uid` | Rename, move, delete (its habits fall back to `group-day`) |
| GET | `/cadence/calendar?from=&to=` | Read-only, for the web calendar. `from` and `to` (inclusive, `YYYY-MM-DD`, at most 400 days apart, otherwise `400`). `{from, to, timezone, habits: [{uid, name, icon_id, color_argb, group_uid, days: [{date, status, done, time}]}]}` with the non-archived habits that appear in the range. `status` is the day status of the statistics (`IDEAL`, `MINIMUM`, `MISSED`, `ACTIVITY`, `NO_ACTIVITY`); `done` is true for `IDEAL`, `MINIMUM`, `ACTIVITY`; `time` is the first enabled reminder of that weekday (`HH:mm`) or `null`. Unplanned and paused days are left out, and a tracker or flexible-period habit appears only on its done days |
| POST | `/cadence/import-legacy` | Import the user's Tududi habits now (see below) |

Collections: `goals` (`habit_goal`), `schedules`, `entries`, `pauses`, `quick-values`, `reminders`, `health-connect-imports`, `abstinence-logs`, `alcohol-consumptions`, `learned-question-records`. Singles: `timer`, `health-connect-rule`, `learned-question-settings`.

An entry created without `occurred_at`, `observed_zone_id` or `local_date` gets now, the user's zone, and the date of the instant in that zone; `source` defaults to `MANUAL`. Changing a past goal is possible (`PATCH .../goals/:uid`) but a new version (`POST .../goals` with a later `effective_from`) is the way to change a goal without rewriting history.

`status.evaluation` is the engine's evaluation of the period containing `date`: `period_start`, `period_end_exclusive`, `progress_minor`, `target_minor`, `attainment` (`TODO`, `MINIMUM`, `IDEAL`), `validates_period`, `is_completed`, `reached_minimum`, `limit_status` (`UNDER`, `AT_LIMIT`, `EXCEEDED`, or null), `session_count`, `is_paused`, `is_planned`, `needs_attention`, `counts_as_failure`. `status.streak` is `{current, best}`. Both are null before the first version.

**Idempotency keys.** The `POST` routes (`/cadence/habits`, `/cadence/habits/:uid/{collection}`, `/cadence/groups`) accept an `Idempotency-Key` header of 1 to 255 visible ASCII characters. The first answer is kept for 24 hours per user. The same key with the same method, path and body gets that answer again, marked `Idempotent-Replayed: true`. The same key with a different body or path gets `422`. A repeat that arrives while the first request is still running gets `409`. An answer that was a server error is not kept, so a retry runs again. Keys older than 24 hours are removed on the next keyed write.

### MCP

`backend/modules/mcp/tools/habitTools.js` calls the same operations as the REST routes (`list_habits`, `get_habit`, `create_habit`, `update_habit`, `delete_habit`, `log_habit_completion`, `get_habit_completions`, `delete_habit_completion`, `get_habit_stats`); reference in [14-mcp-integration.md](14-mcp-integration.md#habits-tools-9). Quantities are minor units, entries and goals use the Cadence field names, and `entry_uid` makes a retried check-in a no-op.

### Importing Tududi habits

At start-up (and on `POST /cadence/import-legacy`) every task with `habit_mode` that has no Cadence habit yet becomes one. Nothing legacy is changed or removed, and a habit already imported is skipped: the Cadence habit takes the uid of the task. Set `CADENCE_SKIP_LEGACY_HABIT_IMPORT=true` to turn the start-up import off.

| Tududi | Cadence |
|---|---|
| `name`, `note`, `habit_color` (`#RRGGBB`), status archived or cancelled | `name`, `description`, `color_argb`, `archived` |
| creation day, or an earlier check-in (in the user's zone) | `starts_on`, and `effective_from` of version 1 |
| build, count 1, daily | goal `BINARY`, target 1, `DAY` |
| build, count N or weekly or monthly | goal `COUNT`, target N, `DAY`, `WEEK` or `MONTH` |
| build with `habit_target_value` and `habit_unit` | goal `QUANTITY`, a custom unit (`custom:<unit>`); amounts are rounded to two decimals when any is fractional (`unit_scale_to_canonical` 100), otherwise stored as is |
| quit | goal `AT_MOST`, target 0, `COUNT`: each check-in is a slip (value 1) |
| `interval` period | schedule `INTERVAL_DAYS`, goal `DAY` |
| `habit_schedule_days` (0 is Sunday) | schedule `SELECTED_DAYS` |
| weekly or monthly | schedule `FLEXIBLE_PERIOD`; otherwise `EVERY_DAY` |
| user's first day of week | `first_day_of_week` |
| `habit_time_of_day` | `group_uid` (`group-morning`, `-afternoon`, `-evening`) |
| `habit_reminder_time` | one `habit_reminder`, every day |
| check-in (`recurring_completions`) | `habit_entry`: `MANUAL`, zone = the user's zone, `local_date` of the instant, value 1 or the amount |
| skipped day | one-day `habit_pause`, reason `REST` |

Differences to know: an amount check-in without a value counted for nothing before and is not imported (the response counts them in `droppedEntries`); the interval period of a legacy habit (one goal per window of N days) becomes a daily goal on every Nth day; streaks and strength are recomputed by the Cadence rules and may differ from the cached figures of the old engine.

### Web screens

`frontend/components/Habits/`, client in `frontend/utils/cadenceHabitsService.ts`, rules in `frontend/utils/cadenceHabitUtils.ts` (units, quantity formatting, card colours, drafts) and `frontend/utils/cadenceHabitSave.ts` (writes). Colours come from `PALETTE` through `ColorPicker` and are stored as signed ARGB; a habit without colour takes the accent of the app.

- **Habits page** (`/habits`): habits grouped by time of day (`habit_group`, empty groups hidden), one card per habit with the Android look: tinted gradient with an ink that reaches 4.5:1 on every stop, hexagon facet filled by the period progress, status line (`2 / 30 min`, `1 of 2 glasses max`, `12 days clear`, paused, not planned), streak, and the quick action: one tap for yes/no, the first quick value for amounts, a chevron for the other quick values and a free amount with a note. Tabs Habits / Archived (restore), a "done for now" line, and "Pause or trip".
- **Habit page** (`/habit/:uid`): streak, best streak, success over 30 days, active days and totals (engine output); a month calendar of the last 365 days where each day shows its status with a glyph as well as a colour, its entries (add, edit date / amount / note, delete); goal and schedule versions in force and past; pauses and trips (create, end today, cancel before they start); edit, archive, delete.
- **Editor** (side panel, also opened by the sidebar "New habit"): name, description, colour, time of day, kind (goal, limit, free activity, abstinence), measure (yes/no, count, quantity, duration) and unit, ideal, minimum, sessions per period, period, schedule (every day, selected days, any day of the period, every N days), quick values, reminders, timer. Changing the goal or the schedule of an existing habit asks how to apply it: **from a date** (default today) appends a version with `POST .../goals` or `.../schedules` so earlier days keep their goal, or **correct the current version** (`PATCH`). Automatic progression is kept when the unit is unchanged but has no editor yet.
- **Abstinence and alcohol**: days clear (current and best run from the engine, 90-day strip, clear days and slips noted), check-ins and urges (`abstinence_log`), a slip today (an entry), and for the alcohol profile the standard drinks per date (`alcohol_consumption`). No savings and no health claim.

Entries typed for a past date send `local_date`, `observed_zone_id` (the zone of the browser) and an `occurred_at` at noon of that date in that zone; for today the server fills them in.
