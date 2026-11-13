# Daily Plan - Behavior Rules

This document explains how the Today page, the "Plan my day" planner and calendar feeds work. For technical details see `/backend/modules/daily-plan/`, `/backend/modules/calendar-feeds/` and `/frontend/components/DailyPlan/`.

---

## Overview

Today is one page (`/today`). Its left column lists the day's candidate tasks; its right panel shows the **Day** calendar, where tasks are placed in free time around your meetings, or the **Agenda**, a chronological list of the same day. `/today/plan` redirects to `/today`.

The classic Today page was removed; `/today_legacy` now redirects to `/today`. Its section lists (Overdue, Planned, Suggested, Completed) still feed the planner's candidates, see [Today Page Sections](02-today-page-sections.md). Its charts (overview counts, completions, area balance) moved to the **Overview** tab of Insights > Reports.

---

## Today (`/today`)

Planning and doing the day happen on one page (`frontend/components/Today/`, redesigned on 2026-11-12, see `docs/fork/TODAY-REDESIGN.md`). The previous page stays reachable at `/today?classic=1` during the migration. The day comes from `GET /api/daily-plan/day` and every plan change is a `PATCH /api/daily-plan/:date` op, applied on screen at once and sent with the plan's ETag; a plan changed on another device reloads instead of being overwritten.

- **Members of the day:** the tasks planned on it, plus the open tasks due that day that are not planned on any other day from today on. Each task appears once. Overdue tasks sit in a folded **Overdue** section (today only), with **Do today** per task and for all; suggestions (tagged today, in progress, tomorrow, this week, in view, the rest) in a folded **Suggestions** section; done tasks in a folded **Done** section. Folded states are remembered (`today.sections`).
- **The list:** a heavy title with the date beside it, a one-line summary ("8 tasks · 4 h 40"; "4 h 40 planned for 3 h 50 free" in amber when the day is overloaded), the quick add field (the task goes on the day, with no due date), then the tasks with a time (slot or due time) in time order, then the others in the plan's order. A row shows the hour (minutes raised), the check, the title and one line of chips: project, two tags, length and end time ("30 min → 9:30") or length, deadline. The task in progress is tinted. Nothing appears on hover.
- **Opening a task:** a click on a row or on a calendar block opens its detail in the pane under the page (`?task=`, `TaskPane` with `placement="bottom"`); the row stays selected. A click on a calendar event opens its read-only card. A right click on a row, or the row's menu once selected, offers: plan at the next free time (T), remove the time, move to tomorrow (D) or next week, take off this day, open.
- **Calendar:** on the right, resizable (`today.listWidth`), hidden with its own button and shown again with the **Calendar** button beside **Organize**. It shows 1, 3 or 7 days from the open day (`today.span`), with ‹ › to change the day (list and calendar always show the same `?date=`). Tasks with a slot are flat blocks in their project's colour (`--block-mix`); calendar events in their calendar's colour; protected time hatched; an open task with a due time and no slot is drawn at its due time as busy (an appointment, often from quick add "tomorrow 3pm"). The now line is red, on today only.
- **Planning by hand:** drag a row onto a column of the calendar to give it a slot there (a task planned on another day moves to that day); drag a block to move it, its bottom edge to resize it (length of this plan line only, the task's estimate stays), back onto the list to remove its time, or Shift/Alt + arrows on a focused block. Slots may overlap; they are drawn side by side. Reordering the rows that have a time reorders the day: the tasks take the day's slot times in their new order, each after the one before and clear of meetings, protected time and appointments (`reflowSlots`). A row without a time dropped among them gets a slot; a row with a time dropped among the others loses it.
- **Moving to another day:** **Move to tomorrow** / **next week** moves the plan line (or plans a due-only task on that day). The due date never changes from this page; every write offers Undo.
- **Organize:** places every task without a time in the free time of the working hours (from now on today), in list order, around events, protected time and appointments; one Undo puts the whole plan back. **Shift the rest** (offered when a slot has run past) moves the late task to now and the later ones after it.
- **Due date edits elsewhere:** a due date change never moves a task off its planned day, whatever wrote it (task API, sync, MCP); only the plan's own ops change the plan (the former `leaveOnMove` hook is gone, `daily-plan-keeps-on-move.test.js`).
- **Recurring tasks:** completing one moves the same task on to its next due date; the plan shows the day's occurrence as done.

- **Android:** the phone reads `GET /api/v1/daily-plan` for today and tomorrow after each sync and keeps the last read on the device (offline, after a restart). Its Today lists the open tasks of today's plan once (a task already listed keeps its place, an overdue task planned today leaves Overdue): a timed item sorts at its slot and shows its time, an untimed one (for example the review's short session) joins the untimed part. A timed item takes its slot in the phone's own "Planifier la journée", and rings like a timed task (see [Notifications](36-notifications.md)). The phone writes the plan, never the due date, for **Reporter** (`move` of today's line, or `add` on the target day), **Aujourd'hui / Demain** of Ma journée's overdue triage (`add`, `move`) and an accepted **Placer** proposal (`slot` with the block's length): each write changes the local copy first and leaves as a `PATCH /api/v1/daily-plan/:date` deferred call (offline included, in order); Undo withdraws a call not yet sent, or sends its inverse (`planning/PlanEdits.kt`). **Plus tard** is the `someday` tag and keeps the due date. Today orders its untimed tasks by the plan, like the web; dragging a row by its handle (or Monter / Descendre) sends `reorder`, or `add` with `before_uid` for a task only due today. On Ma journée's timeline, today's slots move (long press, drag) and stretch (right edge) by quarter hours (`slot`, `resize`). The brief's "À déplacer" proposal and the evening's "Choisir une date" still change the due date, like the web.

## Planner (on Today)

- **Left column:** a short list, "To do today": five candidates at a time in a fixed order (see **Candidate order** below), each shown as its name and, when there is something to say, one grey line: overdue since, in progress, suggested, and the length only when the task carries one (estimate, start→due, or chosen on its card), never the 30-minute default; a task due today on Today has no second line. With a mouse, the **+** appears when the row is hovered or focused (always visible on touch screens). The name opens the task. **Show 5 more** adds five and keeps going: once the loaded suggestions run out it asks the server for the next twenty, until every open task that qualifies has been shown. **Browse** opens the per-group filters and the inbox: a group with no task has no pill, the Inbox pill shows only when the inbox holds something, and no pill ever reads 0. Tasks already planned leave the list. Resting the pointer on a row for a moment, or focusing it (always on touch screens), opens its 15m / 30m / 1h / 2h chips and, for overdue tasks, **Tomorrow**, **Next week** (moves the due date) and **Drop** (cancels the task). The short delay keeps rows from opening and closing while the mouse passes over them.
- Task names on the timeline and in the list view also open the task.

### Candidate order

The order comes from `backend/modules/daily-plan/ranking.js` and each user sets it in **Profile > Planning**.

1. Every candidate falls in one of ten buckets: its group (tagged #today, any open top-level task with a tag named `today` in any case, whatever its dates; overdue, including started tasks past their due date; due today; in progress; everything else) split into tasks in a project and tasks without one. A task tagged #today leaves its other group.
2. Groups follow the user's bucket order (drag or the arrow buttons; saved at once): a group sits where its first bucket does. The default is each group in turn, project tasks first.
3. Inside a group: higher priority first, then the bucket order (so a project task without priority never passes a higher-priority task without a project), then the earlier due date, then the user's tie-break (most recently changed by default, or newest, or oldest), then the task id.
4. Among suggestions, tasks the user decided for this week come first, then tasks **in view**, then the rules above. Both skip the filters below (a future defer-until still holds them back), and their line reads _This week_ or _In view_. See [Review](34-review.md).
5. The suggestion cap (Profile > Planning) keeps the first suggestions in this order, so higher-priority suggestions always make the cut.

The order is stored in `users.ui_settings.planning.candidateOrder`. A saved order that is missing buckets or has unknown ones is repaired on read (missing #today buckets go first, others last), and the profile form's own save keeps the stored order.

Groups follow the task's own due date. A task with no date of its own in a late or due-today project is not overdue here (the Today section lists still count the project's date).

### Which tasks are suggested

"Everything else" is shaped by settings in **Profile > Planning**, stored next to `candidateOrder` in `users.ui_settings.planning` and read through `backend/modules/daily-plan/planningSettings.js`. A missing or unknown value falls back to its default on read; the API rejects unknown values.

| Setting              | Default            | Values                                                         |
| -------------------- | ------------------ | -------------------------------------------------------------- |
| `projectStatuses`    | `["in_progress"]`  | Any project statuses                                           |
| `includeNoProject`   | `true`             | Whether tasks without a project are suggested                  |
| `excludedProjectIds` | `[]`               | Projects never suggested, whatever their status                |
| `tieBreak`           | `recently_touched` | `recently_touched`, `newest`, `oldest`                         |
| `staleAfterDays`     | `null` (off)       | `null`, `90`, `180`: leave out tasks not changed for that long |
| `horizonDays`        | `3`                | `1`, `3`, `7`: nothing due further ahead is suggested          |
| `maxSuggestions`     | `20`               | `10`, `20`, `50`: how many suggestions load at first           |

Plan my day never adds `#someday` tasks to fill a short list. These only filter the suggested group: overdue, due-today and in-progress tasks always show, even from an excluded project. Filters run before the limit, and the limit keeps the first suggestions in the final order. The planner lists every candidate it receives at once, with no **Show more** step: the Planning limit is how many suggestions you see. The response still carries `suggested_total`, and `?suggested_limit=N` (1 to 1000) raises the cap for API clients. The underlying Today suggestions list keeps its own rules (50, three days ahead, no project filter).

### Day hours

The timeline on the planner and on Today shows the user's day, 08:00 to 18:00 by default, set in **Profile > Planning** in 30-minute steps in the user's timezone. It still widens to whole hours around anything planned or on the calendar outside it. New tasks and AI drafts only get a time inside this range. Stored in `users.ui_settings.planning.dayHours` as `{ start, end }` minutes after local midnight; an invalid value falls back to the default.

## Capacity, "Place all" and the day's rhythm

Everything here is rule-based: no AI is called. The slot search is one pure function (`findFreeSlot` in `planUtils.ts`), shared by the per-task **+** and by **Place all** (`planAll` in `autoPlace.ts`), so both follow the same rules.

- **Capacity meter** (Today header, once something is planned; an empty day shows no gauge): a bar of planned time against free time (visible/working hours minus meetings, timed tasks and focus blocks). Amber from 90 %; above 100 % the bar turns red and the message names the excess ("2h too much for today: move something to another day"). Colour is never the only signal.
- **Place all** (timeline mode, today): the candidates, in the ranking order of the candidate list, each take the first free slot from now inside the working hours, around existing blocks, calendar events and focus blocks. Length is the task's estimate (or the length chosen on its card), else 30 minutes. A preview lists the slots; **Apply** saves them (the chosen length becomes the task's estimate) and an **Undo** toast restores the previous plan. A task that fits nowhere stays in the list.
- **Slipped blocks**: once the end of an unfinished timed block has passed, the Now card shows a banner with **Shift the rest** (the block restarts at the next slot from now and the following unfinished blocks move later only as far as needed; one pushed past the end of the day loses its time) and **Later** (only that block is re-placed in the next free slot, else untimed). Both offer Undo.
- **Start-of-day guide** (today, optional): never opens by itself; **Start your day** in the **⋯** menu opens it. Step 1 lists yesterday's unfinished plan items (not already on today's plan) with **Carry to today**, **Later** (the Review decision "later") and **Drop** (cancelled); step 2 picks from the ranked candidates; step 3 shows the capacity meter and **Place all**.
- **Wrap up the day**: the header button is always there on today. It opens the wrap-up card with the day's score and the unfinished tasks to carry over to tomorrow (**Add to tomorrow**); with the AI assistant on, the card also offers the AI recap, and it still opens by itself once the day is over.
- **Focus time**: recurring blocks (weekdays + hours, optional label), edited from **⋯ > Focus time** and kept in `ui_settings.planning.focusBlocks` (`GET`/`PUT /api/daily-plan/focus-blocks`, also returned as `focus_blocks` by `GET /api/daily-plan`; at most 20, 30-minute steps). They show on the Day calendar as busy time, reduce the free time, and Place all, **+** and the AI draft never use them. You can still drag a task onto one by hand. The phone reads and edits the same blocks (Settings › Planning; see below).
- **Exceptions** (holidays, a day off): in the same dialog, a first and a last day (both included), an optional reason, and the blocks they free (**All blocks** by default; one or several blocks once there are two). On those days the freed blocks are not busy time and auto-placement may use their hours. Kept in `ui_settings.planning.focusExceptions` (at most 50); an exception is dropped from the list once its last day has passed (a past day is still shown with it), and when every block it named is deleted. `GET /api/daily-plan` returns them as `focus_exceptions`, and `focus_blocks_of_day` holds the blocks that apply on that date (weekday, less exceptions): the web and the AI draft use that list.
- **Android**: Settings › Planning shows the server's blocks and exceptions (no longer kept on the phone only; blocks made on the phone before are sent once, when the server has none). The phone reads them after each sync and keeps the last read; an edit is kept at once, marked to send and sent after a short pause (even if the page is left), else at the next sync. Blocks kept on the phone before this change only go up when the server has none; otherwise the server's win. A refused edit is dropped and the server's version comes back. Its planner (`DayPlans.focusSlots`) applies the same rule as `focus_blocks_of_day`.
- **Daily quote**: optional (**⋯ > Show/Hide the daily quote**, remembered per browser in `today.showQuote`); off by default on every screen size.

## Task estimates

Tasks have an optional `estimated_minutes` (5 to 720), set from the **Estimate** card on the task page or when a task is added to a plan. It is the default block length; each day's block can differ from it.

---

## Calendar feeds

For two-way sync with a Google account (all calendars editable from here, tasks on a "Cadence" calendar and in Google Tasks), see [Google sync](33-google-sync.md); its calendars appear as chips next to the iCal feeds, and clicking an empty hour or day creates a Google event.

Profile → **Calendars**, or the **Calendars** button on the Calendar page, connects read-only iCal feeds, such as Google Calendar's "Secret address in iCal format". Apple Calendar, Outlook and Fastmail links work too, and `webcal://` links are accepted.

- **Calendar page:** each connected calendar is a chip above the month, week and day views. Click a chip to show or hide that calendar's events; the choice is saved per calendar (`show_on_calendar`, on by default). The same switch is in Profile → Calendars. A hidden calendar is also left out of Today, Plan my day and the AI draft, so its meetings no longer block time there.

- Clicking an event of a feed opens a read-only card: its time, calendar, location (Maps link, copy, and Join for a meeting link) and description. The day view feeding Today and the AI draft keeps to titles and times; the location and description come only to the Calendar page.
- Cadence never writes to these calendars.
- The address is a secret: it is stored encrypted (needs `TUDUDI_SESSION_SECRET` or `TUDUDI_OIDC_SECRET_ENCRYPTION_KEY`) and the API only returns its host.
- The server fetches the feed through the SSRF guard (public hosts only, every redirect checked; `CALDAV_ALLOW_PRIVATE_HOSTS=true` also allows LAN hosts, never link-local or metadata addresses), with a 10 second timeout and a 5 MB limit, and caches it for 15 minutes per process.
- Recurring events (RRULE, RDATE, EXDATE, moved instances), time zones, all-day events and events crossing midnight are expanded in the user's timezone. Cancelled events are dropped.
- If a feed stops working, Today keeps the last good copy when one is cached, and the error shows on the Calendars tab.

---

## Task feed (subscribe from another calendar)

Profile → **Calendars** (and the Calendars dialog on the Calendar page) has **Subscribe to your tasks**. _Make an address_ creates a secret `https://…/api/feeds/tasks/tf_….ics` address to paste into Google Calendar ("From URL"), Apple Calendar or Outlook. The address is shown once; only a SHA-256 of the token is stored (`users.task_feed_token_hash`). _Make a new address_ replaces it and the old one stops working; _Turn off_ removes it.

The feed lists the user's own tasks with a due date from 60 days ago to 400 days ahead, except done, archived and cancelled ones, drawn the same way as on the Calendar page: a timed task from its start time (same day) or its due time for its estimate (an hour without one), a whole-day task as an all-day event from its start day to its due day. Recurring tasks appear at their current due date only.

| Method | Path                          |                                                |
| ------ | ----------------------------- | ---------------------------------------------- |
| GET    | `/api/profile/task-feed`      | `{ enabled }`                                  |
| POST   | `/api/profile/task-feed`      | new address: `{ enabled: true, path }`         |
| DELETE | `/api/profile/task-feed`      | `{ enabled: false }`                           |
| GET    | `/api/feeds/tasks/:token.ics` | the feed, no sign-in; 404 for an unknown token |

## Calendar page: task blocks

How a task is drawn on `/calendar` (`frontend/components/Calendar/taskEvents.ts`):

- **Due time, start time earlier the same day:** a block from the start time to the due time. Dragging its bottom edge changes the due time.
- **Due time otherwise:** a block that starts at the due time and lasts the task's estimate, or one hour without an estimate. Dragging its bottom edge sets the estimate, in 15-minute steps, between 5 minutes and 12 hours.
- **Whole-day due date:** a bar in the all-day row of the week and day views, from the start date (when it is earlier) to the due date. In the month view the bar appears in each day it covers, on the same row all week. A due time with a start on an earlier day is also drawn as a bar.
- **All-day lane limit:** the week and day views draw at most three rows of all-day items; the others sit behind a "+N" chip per day that opens a list. On phones (under 640 px) the view switch is four segments (Month, Week, Day, Agenda) with Year and N days in a "more" menu, and the month view shows one coloured dot per event (three at most); tapping a day lists its events under the grid.
- **Defer until:** a one-hour block at that time, as before.
- **Recurring tasks:** the task sits at its current due date, and its later occurrences up to the end of the loaded window (the month, padded a week each side) are drawn in a lighter blue. They come from `GET /api/tasks?type=calendar&end=YYYY-MM-DD`, which adds `is_virtual_occurrence` copies of each open recurring task, skipping days that already have a generated instance. A later occurrence cannot be moved or resized: move the current one, and the rest follow its new date.

Moving a block keeps its length: a start-to-due block moves both ends, a bar moves its start and due dates by the same number of days and keeps their times. Dropping on an hour of the week or day view sets the time where the block's top lands, in 15-minute steps (`frontend/components/Calendar/dropTime.ts`); dropping in the month view or the all-day row keeps it.

## Calendar page: views

**Year**, Month, Week, **N days**, Day and **Agenda**.

- **Year** shows the twelve months as small grids; each day is shaded by how many items it has (whole-day bars count on every day they cover; later recurring occurrences count only inside the loaded month window). Clicking a day opens it in the Day view; the arrows move by a year.

- **N days** is the week grid for 2 to 7 days starting on the current date (View options → _Days in multi-day view_, `ui_settings.calendar.multiDayCount`, 3 by default). The arrows move by that many days. With weekends hidden it counts working days only.
- **Agenda** lists the month day by day, each day that has something on it under its own heading, whole-day items first. It opens scrolled to today, or the next day with items; the arrows move by a month.

The printer button prints only the shown view, without the sidebar and toolbar.

## Calendar page: View options

The sliders button next to the view switcher opens **View options**, saved per user in `ui_settings.calendar` (`PUT /api/profile/ui-settings` with `{ calendar: {...} }`):

- **Show completed** (`showCompleted`, on by default): done tasks stay on the calendar in green.
- **Show weekends** (`showWeekends`, on): off drops Saturday and Sunday from the month and week views, and the day view steps over them.
- **Show all repeats** (`showRepeats`, on): off keeps each recurring task at its current due date only.
- **Show habits** (`showHabits`, on): draws the due days of the Cadence habits. One item per habit and day, from `GET /api/cadence/calendar?from=&to=` for the loaded window (the whole year in the year view): a whole-day chip in the habit's colour, or a 30-minute block at the time of the habit's first enabled reminder of that weekday. A done day (target reached, minimum reached, or any entry for a tracker or per-week habit) carries a check mark. Paused days are left out; a tracker or flexible-period habit ("3 times a week") appears only on the days it was done, since it is not due on a given day. Habits from before Cadence habits are imported by the server and show the same way. Clicking an item opens the habit page; items are read-only (check-ins stay on the habit). `GET /api/tasks?type=calendar&end=` no longer adds habit days.
- **Days in multi-day view** (`multiDayCount`, 2–7).
- **Show week numbers** (`showWeekNumbers`, off): ISO week numbers on each month row and in the week grid's corner.
- **Show mini calendar** (`showMiniCalendar`, off): a small month beside the views on wide screens; clicking a day goes to it.
- **Show focus sessions** (`showFocus`, on): finished focus sessions as orange blocks at the time they ran (see [Focus Sessions](30-focus-sessions.md)).
- **Show focus sessions** (`showFocus`, on): finished focus sessions as orange blocks (see [Focus Sessions](30-focus-sessions.md)).
- **Holidays** (`holidayCountry`, `holidayRegion`, none by default): the public holidays of a country, and of one of its regions (canton, state…) when picked, as red whole-day items. They come from the `date-holidays` package on the server: `GET /api/holidays/countries`, `GET /api/holidays/regions?country=CH`, `GET /api/holidays?country=CH&region=VD&start=&end=` (at most 400 days). They are not counted in the Year heatmap.
- **Visible hours** (`visibleHours`, `{ start, end }`, whole hours, default 0 to 24): the grid starts at `start` and stops before `end`, so night hours can be hidden. `end` is after `start` and at most 24; an invalid range is ignored. The same setting applies to the Calendar page's day, week and N-day views, the Today calendar and the Today planning timeline. The timeline still widens to include a planned item or event outside the visible hours. When a timed task or event of a shown day falls before `start` or after `end`, the day view and Today calendar show a bar at the top (**N earlier**) or bottom (**N later**) of the grid; the week and N-day views show one badge per day column. Hovering lists the items. Clicking a bar shows the whole day for the current page session (not saved); the hidden band is striped, and **Hide early and late hours** restores the saved window. The default 0 to 24 shows no bars.
- **Colour by** (`colorBy`: `default`, `project`, `priority`, `tag`): a project or tag uses its own colour when it has one, otherwise a stable colour from a fixed palette; priority is red, amber, blue for high, medium, low. Tasks without a project or tag are grey. Done tasks stay green.

## Calendar page: Arrange tasks

The **Arrange tasks** button opens a side panel with two tabs: **No date** (open tasks without a due date) and **Overdue** (open tasks due before today). Done and cancelled tasks, subtasks, habits and recurring previews are left out. Tasks are grouped by project in sections that fold, and can be narrowed by project, tag and priority.

Drag a task onto the calendar to schedule it: onto a day in the month view (or the all-day row) to set its due date, onto an hour of the week or day view to set its due date and time.

## Data model

| Table                    | Purpose                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `daily_plans`            | One row per user per local date (`plan_date`), with `started_at` set when the first task is placed                      |
| `daily_plan_items`       | The tasks in a plan: `position`, `start_minute` (minutes after local midnight, null for untimed) and `duration_minutes` |
| `daily_plans.ai_wrap_up` | The stored AI wrap-up for that day (JSON, optional)                                                                     |
| `calendar_feeds`         | Name, color, encrypted URL, host, last fetch time and last error, and `show_on_calendar`                                |

Plans and feeds are not included in backups: plans are short-lived, and feed addresses are encrypted with this server's key.

---

## API

| Method                | Path                                     | Notes                                                                                                                                                                                                                                                                                             |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                   | `/api/daily-plan?date=`                  | `{ date, day_hours, focus_blocks, focus_exceptions, focus_blocks_of_day, plan, etag }`, the plan or `null`. The date defaults to today in the user's timezone. `etag` is the plan's fingerprint (see below)                                                                                       |
| GET                   | `/api/daily-plan/focus-blocks`           | `{ blocks, exceptions }`; exceptions `{ id, start, end, block_ids, label? }` with dates `YYYY-MM-DD`, `block_ids` `null` for every block                                                                                                                                                          |
| PUT                   | `/api/daily-plan/focus-blocks`           | Body `{ blocks, exceptions? }`; without `exceptions` the saved ones are kept. 400 for an end before the start, a bad date or an unknown block id                                                                                                                                                  |
| GET                   | `/api/daily-plan/candidates`             | `{ tagged_today, overdue, due_today, in_progress, suggested, suggested_total, inbox, inbox_count, ranked }`, each task in one group only; `ranked` lists task uids in the user's order. `?suggested_limit=N` (1 to 1000) sends up to N suggestions instead of the Planning setting; 400 otherwise |
| GET                   | `/api/daily-plan/day?date=`              | One day of the Today page: `{ date, is_today, day_hours, focus_blocks_of_day, plan, etag, due, overdue, overdue_planned, suggestions, completed }`. `overdue`, `overdue_planned` and `suggestions` are filled only for today (`[]` and `null` otherwise). Same Focus params as candidates. Membership below                           |
| GET                   | `/api/daily-plan/ranking`                | `{ order, default_order }`, the ten bucket keys such as `overdue:project`                                                                                                                                                                                                                         |
| PUT                   | `/api/daily-plan/ranking`                | Body `{ order }` with every bucket key once; 400 otherwise                                                                                                                                                                                                                                        |
| GET                   | `/api/daily-plan/hours`                  | `{ start, end }` in minutes after local midnight                                                                                                                                                                                                                                                  |
| GET                   | `/api/daily-plan/suggestions`            | `{ settings, defaults, options }` for the suggested group (see above)                                                                                                                                                                                                                             |
| PUT                   | `/api/daily-plan/suggestions`            | Body with any of the settings; unknown keys or values, and projects the user cannot see, give 400                                                                                                                                                                                                 |
| PUT                   | `/api/daily-plan/hours`                  | Body `{ start, end }`, 30-minute steps, start before end, end at most 1440; 400 otherwise                                                                                                                                                                                                         |
| PUT                   | `/api/daily-plan/:date`                  | Replaces all items: `{ items: [{ task_uid, start_minute, duration_minutes }] }`, in order. Rejects slots past midnight, duplicates and tasks the user cannot see; slots may overlap. Same response as GET, with `etag` and the `ETag` header; takes `If-Match` (see below)                                 |
| PATCH                 | `/api/daily-plan/:date`                  | Applies `{ ops: [...] }` (1 to 100 ops) in order, in one transaction, against the plan as stored at that moment. Same response as PUT. Takes `If-Match`                                                                                                                                           |
| POST                  | `/api/daily-plan/:date/start`            | Marks the day started                                                                                                                                                                                                                                                                             |
| POST                  | `/api/daily-plan/:date/carry-over`       | Appends `{ task_uids }` to that day's plan without a time, skipping tasks already there. Runs the same transactional `add` ops as PATCH                                                                                                                                                           |
| DELETE                | `/api/daily-plan/:date`                  | Clears the plan. `:date` may be `today`                                                                                                                                                                                                                                                           |
| GET/POST/PATCH/DELETE | `/api/calendar-feeds[/:uid]`             | Manage feeds. POST fetches the feed once and refuses it if it cannot be read. PATCH also takes `show_on_calendar`                                                                                                                                                                                 |
| GET                   | `/api/calendar-feeds/events?date=`       | `{ date, events, errors }` for that day                                                                                                                                                                                                                                                           |
| GET                   | `/api/calendar-feeds/events?start=&end=` | `{ start, end, events, errors }` for up to 62 days; each event carries its `date`, and a multi-day event appears once per day. Hidden calendars are included, the Calendar page filters them                                                                                                      |

**Day lists (`GET /api/daily-plan/day`).** A task is in a day's `due` when it is open, visible, a top-level task that is not a habit or a recurring occurrence, due on that day (user timezone), and not planned on that day nor on any day from today on. A task planned only on a past day stays in `due`. `overdue` (today only, due date ascending): open visible tasks due before today, not planned on a day from today on. `overdue_planned` (today only): the open visible tasks due before today and planned on a later day, each with `planned_date`, the nearest such day; the Plan board ignores it, Today lists it under Overdue. `completed`: done within the day and not in its plan, 50 most recent. `suggestions` (today only) come from the candidates, without any task already in the plan, `due`, `overdue` or `overdue_planned`; `this_week` (current week's `week_of`), `in_view`, `suggested` split the suggested group. The rule lives in `backend/modules/daily-plan/day.js`.

**PATCH ops.** Each op takes a `task_uid`; the task must be one the user can see, else 404 and nothing is written (`remove` alone also accepts a task that was shared with the user and is no longer visible, so it can be taken off the day):

- `{ op: 'add', task_uid, start_minute?, duration_minutes?, before_uid? }`: appends the line (or inserts it before `before_uid`); the duration defaults to the task's estimate, else 30. A task already on the day keeps its place and only takes the fields given.
- `{ op: 'remove', task_uid }`: no-op when absent.
- `{ op: 'slot', task_uid, start_minute, duration_minutes? }`: sets the time, adding the line when absent.
- `{ op: 'unslot', task_uid }`: clears the time; the line stays.
- `{ op: 'resize', task_uid, duration_minutes }`: changes the length only.
- `{ op: 'reorder', task_uid, before_uid }`: moves the line before another, or to the end when `before_uid` is `null`. Positions become `0..n-1`.
- `{ op: 'move', task_uid, to_date }`: takes the line off this day and appends it to `to_date` (no time, same duration). If `to_date` already holds the task, its line there is kept.

After all ops, the rules of PUT run on each day the batch changed: ranges, no slot past midnight, no duplicates (slots may overlap, drawn side by side). Any failure answers 400 and nothing is written. Ops never write task fields (no due date, no estimate).

**ETag and If-Match.** `etag` is the first 16 hex characters of the SHA-1 of the ordered visible items `[task_uid, start_minute, duration_minutes]`. It moves whenever the list, a time or a length changes. GET, PUT and PATCH return it in the body and PUT and PATCH also send it as the `ETag` header (quoted). A PUT or PATCH sent with `If-Match: "<etag>"` is checked inside the transaction: when the plan has changed since it was read, the answer is `409 { error: 'plan_changed', plan }`, where `plan` is the current response, and nothing is written. Without `If-Match` (or with `*`), the write applies as before, so older Android builds keep working.

**Concurrency.** Writes to the same day take a per-day lock (PostgreSQL advisory lock; SQLite has a single writer), so two writes that both add to one day keep both lines. `carry-over`, the task API `today` flag, the MCP day tools and the triage slots write through the same transactional path.

`GET /api/daily-plan` and `GET /api/daily-plan/candidates` also take the Focus scope params `area_uid`, `project_uid` and `tags` (see [Focus](25-focus.md)). Candidates are then narrowed to the scope. The plan keeps every item, since `PUT /api/daily-plan/:date` and carry-over replace the whole list from what the client holds, and marks each item `in_focus: true|false` instead; Today and the planner dim the ones outside the Focus.

---

## AI help

Everything in this section appears only while the **AI assistant** is switched on for the user (Profile → Features). With it off the planner and Today look exactly as described above, and the AI endpoints return `403`.

- **Planning tips** (planner and Today): worked out locally, no model call, at most three at a time.
    - Missed blocks: offers **Move to next free slots**.
    - Overbooking: "Planned 3h 30m, only 1h 25m free: 2h 5m over".
    - A free gap that fits an unplanned task: offers **Place it**.
    - No break for three hours or more.
    - Today shows only the missed-block and gap tips.
- **Draft with AI** (planner header):
    - On an empty plan it drafts straight away; otherwise it offers **Fill free time** (keeps what is planned) or **Start over**.
    - The server gives the model the candidates (up to 60), busy meetings, free gaps, the current time and the user's "About you".
    - The server then cleans up the answer (`sanitizeDraft` in `backend/modules/daily-plan/ai.js`): only known tasks, 15-minute grid, never in the past or on top of a meeting or another block. A clash moves to the next free slot, or loses its time.
    - The draft is applied locally, so it autosaves like any edit. **Undo** restores the previous plan. Drafted blocks show a sparkle, with the AI's reason as a tooltip.
- **Length guesses:** when the planner opens, one request estimates up to 40 candidates without an estimate. The guess is pre-selected on the card's chips (marked with a dot) and saved as the task's estimate only when the task is added. Guesses are cached per server process for 24 hours.
- **Day wrap-up** (Today):
    - Offered once the last timed block has ended, or when everything is done.
    - Returns a short summary, wins, a pattern and the unfinished tasks worth carrying over.
    - **Add to tomorrow** appends the selected ones, untimed, to the next day's plan (`POST /api/daily-plan/:date/carry-over`).
    - Stored in `daily_plans.ai_wrap_up`, so it is not regenerated on every visit.

Each draft, estimate batch or wrap-up counts as one AI request, and one AI credit in hosted mode. See [AI Assistant](13-ai-assistant.md).

## Known limitations

- Two open planners for the same day overwrite each other; the last save wins.
- Unfinished tasks are only carried to the next day's plan when you choose them in the wrap-up card.
- Focus exceptions only free blocks; there is no one-off extra block for a single date.
- Focus blocks and exceptions are saved as one list: two devices editing them at the same time, or a phone edit sent after a long time offline, keep the last save.
- There are no MCP tools for the plan yet.

## Timed tasks on the day grid

A timed task that is not in the plan is drawn on the grid with its own hour. Dragging it moves its due time (with its start, keeping its length), its bottom edge changes its length, and its title opens it. An event of a Google calendar set to two-way moves and stretches the same way, through Google; other events stay fixed, and a Google one says why on hover. An event over several days stays fixed too. What overlaps shares the width side by side (`planUtils.sideBySide`), and a calendar's name only shows when a block has the full width. The "drag tasks here" hint sits above the grid, never on the hours.

Today is for doing: the list shows the day (tagged #today, overdue, due today, in progress). What could come next waits in sections folded under it, closed at each visit: **Tomorrow** (`tomorrow` in `GET /api/daily-plan/candidates`, due tomorrow and not on the day), **This week**, **In view** and **Suggested**. "+" on one of them plans it for today. "Place all" and "Help me choose" work on the day. A routine due later is not suggested: it comes back by itself. Browse still shows each list whole.

Android does the same under its Today list, with what its day shows.

## Your order of the day

Dragging a task onto another row of the list puts it at that place (`PUT /api/daily-plan/today-order` `{ task_uids }`, stored in the synced `tasks.today_order`). What was placed by hand comes first, in that order; the rest follows the ranking, with the day's tasks that have an hour following the clock. A task of someone else keeps its place. Dragging onto the day grid still gives a time. On Android, the task's menu in Today offers Move up and Move down, which write the same field.
