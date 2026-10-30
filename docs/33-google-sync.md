# Google Calendar & Google Tasks sync (fork)

Two-way sync with one Google account per Cadence user, in the spirit of TickTick's Google integration. Module: `backend/modules/google-sync/`.

**Related:** [Daily plan & Calendar](20-daily-plan.md), [Tasks](00-tasks-behavior.md), [Recurring tasks](01-recurring-tasks-behavior.md)

## What syncs

| Google side                                                  | Cadence side                                                                                         | Direction                                                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Every calendar of the account                                | Chips on the Calendar page, events on Calendar, Today, Plan my day and the AI draft                 | Per calendar: **Hidden**, **Read only** (default) or **Two-way** (only where Google lets the account write: owner/writer)        |
| The secondary calendar **"Cadence"** (made on the first sync) | Open tasks with a due **time** (every dated task when Google Tasks sync is off)                    | Both ways                                                                                                                        |
| Google Tasks: the default list                               | Tasks without a project (not the timed ones while calendar sync is on)                              | Both ways                                                                                                                        |
| Google Tasks: every other list                               | One project per list (made by name when missing; a project's list is made when it first has a task) | Both ways                                                                                                                        |

### Calendar events (other calendars)

- Each calendar has a **sync mode** (Profile → Calendars, select next to its name):
  - **Hidden**: not read from Google and shown nowhere (Calendar, Today, Plan my day, AI draft). Its stored copies are dropped; switching back reads it afresh.
  - **Read only** (default, also for calendars that existed before this setting): shown, but not editable from Cadence even when Google would allow it.
  - **Two-way**: editable from the Calendar page as below. Offered only when Google lets the account write (owner/writer).
- Events created in Google stay events (they never become tasks); only the "Cadence" calendar turns events into tasks. The show/hide switch next to the mode only toggles display.

- On a two-way calendar: click an empty hour (week/day view) to create a one-hour event, a day (month view, week header) for an all-day event, an event to edit or delete it. Drag to move, drag the bottom edge to change the end.
- A repeating event is changed one occurrence at a time (Google keeps it as an exception). Edit the whole series in Google.
- Each calendar can be shown or hidden (chip on the Calendar page, or Profile → Calendars). A hidden calendar is also left out of Today, Plan my day and the AI draft. The first time, calendars hidden in Google stay hidden.
- Copies are stored in `google_events`; the first sync reads 90 days back and everything ahead.

### Tasks on the "Cadence" calendar

- **Calendar for tasks with a time** (Profile → Calendars): the "Cadence" calendar made by the sync (default) or any calendar Google lets the account write to. In a chosen calendar, only events marked as tasks (`extendedProperties.private.tududiTaskUid`, set by Cadence) are tasks; the user's other events there stay ordinary events (shown per the calendar's mode) and are never turned into tasks. Changing the choice moves the task events on the next sync (deleted from the previous calendar, created in the new one). A chosen calendar that disappears or becomes read-only falls back to "Cadence". While another calendar receives the tasks, the "Cadence" calendar is not read.
- The rest of this section applies to whichever calendar receives the tasks.

- Where a task sits matches the Calendar page: due time + estimate (default 60 min), start time → due time, or whole days from a whole-day start to the due day. A task with a date but no time is an all-day event.
- Moving or resizing the event in Google moves the task (due date/time, start, or estimate); renaming it renames the task.
- Deleting the event in Google **takes the date off the task**; the task stays.
- A finished task leaves the calendar. An undated task is not on it.
- An event added to the "Cadence" calendar in Google becomes a new task (only the "Cadence" calendar does this).
- A recurring task shows only its **next occurrence**.
- The events are "free" (transparent) so they do not block your availability in Google.

### Google Tasks

- Synced fields: title ↔ name, notes ↔ note, completed ↔ done, due **day** ↔ due date, parent ↔ subtask, list ↔ project.
- Google Tasks keeps only the day of a due date (its API has no time). When Google keeps the same day, the time set in Cadence stays.
- Completing a recurring task in Google moves it to its next occurrence in Cadence, and Google gets it back as open with the new date.
- Deleting a task in Cadence deletes it in Google Tasks. Deleting a task in Google Tasks **marks the Cadence task done** (with its completion time; a recurring task stops) instead of deleting it; it is not sent back to Google while it stays done, and reopening or editing it in Cadence sends it again.
- Deleting a whole list in Google does **not** delete the Cadence tasks: they are unlinked and sent to a new list on the next sync.
- A task completed more than 7 days before the first sync is not sent; a Google task already completed before the first sync is not imported.
- Not synced: priority, tags, status other than open/done (in progress, waiting, planned stay open in Google; archived and cancelled tasks are removed from Google), habits, recurring instances.

### One place per task

With both switches on, each task goes to Google once: a task with a due **time** becomes an event on the "Cadence" calendar, any other task (undated, or dated without a time) a Google Task. A task that gains a time leaves Google Tasks and becomes an event on the next sync; one that loses its time leaves the calendar and becomes a Google Task. An all-day event added to the "Cadence" calendar in Google therefore becomes an untimed task and moves to Google Tasks.

With only one switch on, that side takes every task it can hold: calendars only → every dated open task is an event (all-day when untimed); tasks only → every task is a Google Task.

## Timing and conflicts

- The server syncs every `GOOGLE_SYNC_INTERVAL_MINUTES` (default 2), and right after connecting or changing a setting. **Sync now** in Profile → Calendars runs it at once. Edits made from Cadence's Calendar page go to Google immediately.
- Calendars use Google's sync tokens (only changes are fetched; an expired token restarts a full read). Google Tasks has no sync token: the sync asks for items updated since the last run.
- Each linked item keeps a hash of its synced fields on both sides (`google_task_links`). When only one side changed, it wins. When both changed since the last sync, the later edit wins (`tasks.updated_at` against Google's `updated`).

## Setup (administrator)

1. Google Cloud Console → new project → enable **Google Calendar API** and **Google Tasks API**.
2. OAuth consent screen: type External, add yourself as a user, scopes `calendar` and `tasks`. Then **Publish app** (to "In production"). In "Testing" mode Google expires the refresh token after 7 days and the sync stops; an unverified app in production only shows a warning screen once, which is fine for personal use.
3. Credentials → OAuth client ID → Web application → Authorised redirect URI: `https://<your Cadence>/api/google/oauth/callback`.
4. Set on the server:

| Variable                                                         | Meaning                                                                                                                    |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                       | The OAuth client. Without them the section says it is not set up.                                                          |
| `GOOGLE_REDIRECT_URI`                                            | Optional. Defaults to `<origin of the browser>/api/google/oauth/callback`. Set it behind a proxy that changes the address. |
| `GOOGLE_SYNC_INTERVAL_MINUTES`                                   | Optional, 1–60, default 2.                                                                                                 |
| `TUDUDI_SESSION_SECRET` (or `TUDUDI_OIDC_SECRET_ENCRYPTION_KEY`) | Required: tokens are encrypted with it.                                                                                    |

The Cadence server must reach `oauth2.googleapis.com`, `www.googleapis.com`, `tasks.googleapis.com` and `openidconnect.googleapis.com`. It does not have to be reachable from the internet (no push notifications are used).

Then each user: Profile → Calendars (or Calendar → Calendars) → **Connect Google**.

## Disconnecting

**Disconnect** revokes the token and deletes every Google copy and link kept in Cadence. Cadence tasks stay, and so does everything already on Google (including the "Cadence" calendar and the lists). Turning one switch off (calendars or tasks) unlinks that side only; turning it back on starts a fresh link, which can create duplicates of items that were left on Google meanwhile.

## API

All under `/api`, signed in.

| Method         | Path                                   |                                                                                                                                       |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET            | `/google`                              | Connection status, settings, calendars                                                                                                |
| GET            | `/google/connect?origin=`              | `{ url }` of Google's sign-in page                                                                                                    |
| GET            | `/google/oauth/callback`               | Google sends the browser back here; redirects to `/calendar?google=connected`                                                         |
| DELETE         | `/google`                              | Disconnect                                                                                                                            |
| PATCH          | `/google/settings`                     | `{ sync_events, sync_tasks, task_calendar_uid }` (null: "Cadence")                                                                                                       |
| POST           | `/google/sync`                         | Sync now                                                                                                                              |
| PATCH          | `/google/calendars/:uid`               | `{ show_on_calendar, sync_mode }` (`hidden`, `read`, `two_way`)                                                                                                              |
| POST           | `/google/events`                       | `{ calendar_uid, title, description, location, all_day, start, end }` or `{ …, all_day: true, start_date, end_date }` (end exclusive) |
| PATCH / DELETE | `/google/events/:calendarUid/:eventId` | Edit / delete one event (one occurrence of a repeating event)                                                                         |

Google events are also returned by `GET /api/calendar-feeds/events` with `source: "google"`, `calendar_uid`, `event_id`, `editable`, `feed_uid: "google-<calendar uid>"`.

## Schema

`google_accounts` (one per user, tokens encrypted, `task_calendar_id`), `google_calendars` (calendar list, `show_on_calendar`, `sync_mode`, sync token, `is_tududi`), `google_events` (copies of other calendars' events), `google_tasklists` (list ↔ project), `google_task_links` (task ↔ Google event or Google task, with the hashes). Migrations `20261030090000-create-google-sync.js`, `20261030120000-add-sync-mode-to-google-calendars.js`, `20261030130000-add-task-calendar-to-google-accounts.js`.

## Limits

- One Google account per Cadence user.
- Whole recurring series cannot be edited from Cadence.
- Google Tasks loses the time of day; the "Cadence" calendar keeps it.
- Tasks shared with you in someone else's project are not sent (only tasks you own).
