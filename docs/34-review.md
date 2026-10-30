# Review, decision funnel and postponements

Fork page. The app keeps hundreds of ideas without showing them all every day, and shows what keeps slipping when the user chooses to look. Nothing here needs AI, nothing here sends notifications, and nothing here is a due date.

## The funnel

| Stage | What it means | Where it lives |
|---|---|---|
| **Inbox** | Captured, not decided | The existing Inbox (`inbox_items`). Capture asks for nothing. |
| **In view** | A possibility kept in sight. Not a commitment, a priority, a pin or a status. | `tasks.in_view_at` |
| **This week** | Decided for this week. Not a due date. | `tasks.week_of` (first day of the week, by the user's first day of week) |
| **Today** | The day's plan | The existing Today planner (`daily_plans`) |
| **Now** | The block being done | The existing Now card |
| **Later** | Parked: kept, searchable, out of daily suggestions | The existing `#someday` system tag, plus an optional review date `tasks.review_on` |
| **Review** | Maintenance, opened when the user wants | `/review` |

Projects have no "In view" flag: Favorites already keep chosen projects in sight. A project is parked with the `#someday` tag, as before.

Three different intentions stay three different things:

- *Hide until a moment* → **Defer until** (`defer_until`), unchanged.
- *Waiting on something* → status **Waiting** or a blocking relation, unchanged.
- *Keep for later, decide again some day* → **Later**, with an optional **review date**.

### Setting them

- Task pane (Minimal): three chips, **In view**, **This week**, **Later**. A **Review on** date appears only for a parked task or one that already has a date.
- Right-click menu of a Minimal row: the same three choices.
- Review page: one visible **Decide** button per row (label always shown, with a chevron) that opens a menu with the choices that fit the list.
- API: `PATCH /api/task/:uid` accepts `in_view` (boolean), `week_of` (`YYYY-MM-DD` in that week, `this_week`, `next_week` or `null`), `review_on` (`YYYY-MM-DD` or `null`), `later` (boolean) and `reviewed: true`. MCP `update_task` takes the first four.

`later: true` adds the user's `#someday` tag and takes the task out of view, out of the week and off today's plan; it wins over `in_view` or `week_of` sent with it. `later: false` removes the tag. A parked task keeps its project, note, tags, links and history, stays in search, and is never shown as overdue on Today (the existing `#someday` rule). Its due date, if it has one, is left alone.

### On Today

In the "To do today" list, tasks decided for this week come first among the suggestions, then tasks in view, before the usual ranking. They skip the Planning filters (project status, horizon, staleness) because the user chose them; a defer-until date in the future still holds them back. Their line says *This week* or *In view* instead of *Suggested*. Plan my day never falls back on `#someday` tasks any more.

**Help me choose** (above the list when there are two or more candidates) shows two tasks side by side: title, project, estimate. The pick stays and meets the next one; **Neither** drops both. The last one left can be added to the day. Nothing about the tasks changes; there is no score.

## Postponements

### What counts

The history is the one the app already keeps: `due_date_changed` rows in `task_events`, and the user's day plans in `daily_plans`. Nothing is counted at write time, so every number can be rebuilt from those rows.

Each due date change is read in the user's timezone:

| Kind | Rule | A postponement? |
|---|---|---|
| Pushed back | Moved to a later day while the old day had come, or was tomorrow | Yes |
| Rescheduled | Moved to a later day well ahead of time | No: a plan change |
| Time changed | Same day, another time ("Push to later" in the planner does not even touch the due date) | No |
| Moved earlier, date set, date removed | — | No |
| Changed automatically | Written by an import, a sync, recurrence or any source other than the app or an API key | No |

A day plan counts too: a one-off task that was on a past day's plan and was not completed by the end of that day was *planned, not done*. Recurring tasks and habits are left out of this, since they reopen on their own.

**One push per day given up.** Being pushed off Tuesday's plan and having its Tuesday due date moved is one push, not two. Moving a task three times in one afternoon is one push for the day it left.

Only the user's own writes count for them. On a shared task, another person's changes are theirs, and the pane shows only the viewer's own history.

Writes that are never logged as due date changes: completing a recurring task (logged as an occurrence), skipping or moving an occurrence, Google Calendar/Tasks sync, offline sync, MCP, spreadsheet import (logged with source `import`). A save that sends the same due date again logs nothing.

### Frequently pushed back

A task is listed under **Pushed back** when it was pushed **3 times or more in the last 30 days**. **Keep as is** in the review starts the count again from that day; the full history stays.

History older than the logs is unknown, not rebuilt: older events stored the date as sent, and a plan only exists from the day the planner was used.

### In the task pane

Once a task has been pushed back, a single grey line shows *Pushed back N times, M in the last 30 days · last date*. A click lists the history (pushed back, rescheduled, date removed, planned not done) newest first. Rows in lists carry no new badge.

## The Review page

Opened from **More** in the Minimal rail (it can be moved to the rail in Profile → Sidebar), from the app launcher, or from Insights in Dense. Route `/review`.

The tabs are the steps of a review, in order; each can be opened alone, and the page remembers the last one in this browser. **Next: …** at the bottom goes to the next step. Decisions are saved one by one on the tasks themselves, so a review stopped after four items resumes where it was and loses nothing. The header shows how many items need a look (each counted once even when it is in two lists) and how many were decided this week.

| Tab | Lists | Choices |
|---|---|---|
| **To decide** | Open Inbox items, oldest first | Make a task, This week, Park for later, Discard; the Inbox itself for anything else |
| **Pushed back** | Frequently pushed tasks, most pushed first, with project, count and last planned day | Do today, Short session today (25 min on today's plan), Break into steps (opens the task), Later, Drop, Keep as is |
| **Stalled projects** | Active projects (in progress or planned) with no next task, no change in 30 days, or two or more tasks pushed back | Add the next task (inline field), Open project, Put on hold, Keep as is |
| **Later** | Parked tasks and any task whose review date has come; due reviews first | Review in 30 days, Review on…, In view, This week, Keep parked, Drop |
| **Old** | Open tasks unchanged for 90 days (not parked, waiting, recurring, habits or subtasks) | This week, In view, Later, Keep as is, Drop |
| **This week** | Tasks decided for this week, then tasks in view, with planned time | Decided: Do today, Not this week, Later. In view: This week, Out of view, Later. **Help me choose** |

Stalled projects leave out projects that are waiting, not started, done, cancelled, parked (`#someday`), templates, and projects whose open tasks are all waiting or deferred. "No change in 30 days" is not raised for a project with a due date ahead. **Keep as is** hides "no next task" until the project or one of its tasks changes, and "no change" for another 30 days (`projects.reviewed_at`).

Every choice also stamps `tasks.reviewed_at`; that is what "decided this week" counts and what makes an old task young again.

### Capacity

The week tab shows *4h 30m planned / 6h available*: the sum of the estimates of the tasks decided for the week, against a weekly time the user sets by clicking **Set available time** (stored in `ui_settings.planning.weekCapacityMinutes`; leave it empty to see only the planned time). Tasks without an estimate are counted, never required. The day planner and its hours are unchanged.

## Sync and other clients

- `in_view_at`, `week_of`, `review_on` and `reviewed_at` are in the offline sync registry, so clients carry them.
- Google Calendar and Google Tasks hash fixed projections of the task (title, dates, status, notes); these fields are not in them, so they never reach Google and never trigger a push.
- Backups export and restore them.

## API

- `GET /api/review` → `{ counts: { pushed, undecided, later, review_due, projects, stale }, attention_total, decided_this_week, week_start }`
- `GET /api/review/:category?limit=&offset=` (`pushed`, `undecided`, `later`, `projects`, `stale`; limit 1–200, default 50) → `{ total, items }`
- `GET /api/review/week` → committed and in-view tasks, `planned_minutes`, `unestimated`, `capacity_minutes`
- `PUT /api/review/week/capacity` `{ capacity_minutes: number | null }`
- `GET /api/task/:uid/postponements` → counts, `last_postponed_on`, `last_planned_for`, `changes` (each with `kind`, `from`, `to`, `at`, `source`), `missed_days`; read access to the task is required
- `POST /api/project/:uid/reviewed` → keeps a stalled project as it is; write access required

Lists are computed per request from indexed queries over the last 30 days of the user's own events and plans, so the page stays quick with thousands of tasks; long lists are paged.
