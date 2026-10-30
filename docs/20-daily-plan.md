# Daily Plan - Behavior Rules

This document explains how the Today page, the "Plan my day" planner and calendar feeds work. For technical details see `/backend/modules/daily-plan/`, `/backend/modules/calendar-feeds/` and `/frontend/components/DailyPlan/`.

---

## Overview

Today is one page (`/today`). Its left column lists the day's candidate tasks; its right panel shows either the **Planning** timeline, where tasks are placed in free time around your meetings, or the day's **Calendar**. `/today/plan` redirects to `/today`.

The classic Today page was removed; `/today_legacy` now redirects to `/today`. Its section lists (Overdue, Planned, Suggested, Completed) still feed the planner's candidates, see [Today Page Sections](02-today-page-sections.md). Its charts (overview counts, completions, area balance) moved to the **Overview** tab of Insights > Reports.

---

## Today (`/today`)

Planning and doing the day happen on one page. There is no start button: the plan saves as you edit it.

- **Left column:** the day's candidates, grouped and ordered as in the planner (see **Candidate order** below), each with the round check. The round check completes the task in place; it leaves the list and an undo toast brings it back. Drag a candidate onto the timeline, or press its **+** to place it in the next free slot. On phones the **+** is the way to place a task.
- **Right panel:** a **Planning** / **Calendar** switch, remembered per browser (`today.panelMode`, default Planning).
  - **Planning:** the timeline (or list) of plan items. Place, resize and remove blocks; calendar events show as busy time. The Now card sits above it when the plan has items, with **Mark done** and **Push to later**. Open timed tasks that are not in the plan and fall before the visible hours show a **N earlier** bar above the timeline, and those after them a **N later** bar below it; a click on either shows the whole day. The **⋯** menu of the planning view holds **Show all hours** (a toggle that shows 0 to 24 for the page session, not saved) while the visible hours are narrower than the day.
  - **Calendar:** the day's calendar in the Calendar page's day view: tasks by their due time and calendar feed events. Dragging uses the same system as the left column (dnd-kit), onto 15-minute slots or the **All day** row:
    - a candidate, or a block, dropped on a slot becomes due on the shown day at that time (an all-day block becomes timed);
    - a timed block dropped on another slot moves to that time and keeps its length;
    - a timed block dropped on the **All day** row loses its time (due that day, whole day).
    The visible hours (below) limit the grid. The **⋯** menu on the panel header holds **Visible hours**.
- **Calendar toggle:** hides or shows the right panel, and the task list then takes the full width. Remembered in `today.calendarOpen`; open by default on wide screens.
- **Day navigation:** the previous and next day arrows and **Today** move between days. The day is kept in the URL as `?date=YYYY-MM-DD` (no parameter means today), so a reload keeps it. Candidates are ranked for today only: another day lists its open tasks due that day, and that day is not started and gets no AI draft.
- **Starting the day:** placing the first task on today's plan starts the day (`started_at`) once the plan has saved.
- **Planned tasks without a time:** the timeline's **Today, no time yet** tray lists them. Drag one onto another to swap their places; untimed tasks only change places among the untimed ones, and timed tasks keep their slots. The order is saved with the plan (it is the plan's `position`). Dragging one onto the timeline gives it a time.
- **Moving a planned task's due date:** **Tomorrow** and **Next week** on a tray row, or on a row in list view, set the due date to that day (or seven days on). A task whose due date moves past today leaves today's plan, and an Undo toast puts it back. A task already due later than today stays in the plan. Timed blocks on the timeline have no date chips: use the list view or the tray.
- **Progress:** the header shows done/total and time left once the plan has items, and the sidebar shows it too.
- **Recurring tasks:** completing one moves the same task on to its next due date and reopens it. The plan still shows the day's occurrence as done (crossed out, with the next date) and counts it in `done/total`.
- **AI help:** the planning tips and **Draft with AI** appear on today only. The day wrap-up is offered once the last timed block has ended, or when everything is done.

## Planner (on Today)

- **Left column:** a short list, "What could you do today?": five candidates at a time in a fixed order (see **Candidate order** below), each shown as its name and one grey line. The name opens the task. **Show 5 more** adds five and keeps going: once the loaded suggestions run out it asks the server for the next twenty, until every open task that qualifies has been shown. **Browse** opens the per-group filters and the inbox. Tasks already planned leave the list. Resting the pointer on a row for a moment, or focusing it (always on touch screens), opens its 15m / 30m / 1h / 2h chips and, for overdue tasks, **Tomorrow**, **Next week** (moves the due date) and **Drop** (cancels the task). The short delay keeps rows from opening and closing while the mouse passes over them.
- Task names on the timeline and in the list view also open the task.

### Candidate order

The order comes from `backend/modules/daily-plan/ranking.js` and each user sets it in **Profile > Planning**.

1. Every candidate falls in one of ten buckets: its group (tagged #today, any open top-level task with a tag named `today` in any case, whatever its dates; overdue, including started tasks past their due date; due today; in progress; everything else) split into tasks in a project and tasks without one. A task tagged #today leaves its other group.
2. Groups follow the user's bucket order (drag or the arrow buttons; saved at once): a group sits where its first bucket does. The default is each group in turn, project tasks first.
3. Inside a group: higher priority first, then the bucket order (so a project task without priority never passes a higher-priority task without a project), then the earlier due date, then the user's tie-break (most recently changed by default, or newest, or oldest), then the task id.
4. Among suggestions, tasks the user decided for this week come first, then tasks **in view**, then the rules above. Both skip the filters below (a future defer-until still holds them back), and their line reads *This week* or *In view*. See [Review](34-review.md).
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

Plan my day never adds `#someday` tasks to fill a short list. These only filter the suggested group: overdue, due-today and in-progress tasks always show, even from an excluded project. Filters run before the limit, and the limit keeps the first suggestions in the final order. The limit is a first page, not a ceiling: the response carries `suggested_total`, and `?suggested_limit=N` (1 to 1000) raises the cap so **Show more** can page through the rest. The underlying Today suggestions list keeps its own rules (50, three days ahead, no project filter).

### Day hours

The timeline on the planner and on Today shows the user's day, 08:00 to 18:00 by default, set in **Profile > Planning** in 30-minute steps in the user's timezone. It still widens to whole hours around anything planned or on the calendar outside it. New tasks and AI drafts only get a time inside this range. Stored in `users.ui_settings.planning.dayHours` as `{ start, end }` minutes after local midnight; an invalid value falls back to the default.

## Task estimates

Tasks have an optional `estimated_minutes` (5 to 720), set from the **Estimate** card on the task page or when a task is added to a plan. It is the default block length; each day's block can differ from it.

---

## Calendar feeds

For two-way sync with a Google account (all calendars editable from here, tasks on a "Tududi" calendar and in Google Tasks), see [Google sync](33-google-sync.md); its calendars appear as chips next to the iCal feeds, and clicking an empty hour or day creates a Google event.

Profile → **Calendars**, or the **Calendars** button on the Calendar page, connects read-only iCal feeds, such as Google Calendar's "Secret address in iCal format". Apple Calendar, Outlook and Fastmail links work too, and `webcal://` links are accepted.

- **Calendar page:** each connected calendar is a chip above the month, week and day views. Click a chip to show or hide that calendar's events; the choice is saved per calendar (`show_on_calendar`, on by default). The same switch is in Profile → Calendars. A hidden calendar is also left out of Today, Plan my day and the AI draft, so its meetings no longer block time there.

- Tududi never writes to these calendars.
- The address is a secret: it is stored encrypted (needs `TUDUDI_SESSION_SECRET` or `TUDUDI_OIDC_SECRET_ENCRYPTION_KEY`) and the API only returns its host.
- The server fetches the feed through the SSRF guard (public hosts only, every redirect checked; `CALDAV_ALLOW_PRIVATE_HOSTS=true` also allows LAN hosts, never link-local or metadata addresses), with a 10 second timeout and a 5 MB limit, and caches it for 15 minutes per process.
- Recurring events (RRULE, RDATE, EXDATE, moved instances), time zones, all-day events and events crossing midnight are expanded in the user's timezone. Cancelled events are dropped.
- If a feed stops working, Today keeps the last good copy when one is cached, and the error shows on the Calendars tab.

---

## Task feed (subscribe from another calendar)

Profile → **Calendars** (and the Calendars dialog on the Calendar page) has **Subscribe to your tasks**. *Make an address* creates a secret `https://…/api/feeds/tasks/tf_….ics` address to paste into Google Calendar ("From URL"), Apple Calendar or Outlook. The address is shown once; only a SHA-256 of the token is stored (`users.task_feed_token_hash`). *Make a new address* replaces it and the old one stops working; *Turn off* removes it.

The feed lists the user's own tasks with a due date from 60 days ago to 400 days ahead, except done, archived and cancelled ones, drawn the same way as on the Calendar page: a timed task from its start time (same day) or its due time for its estimate (an hour without one), a whole-day task as an all-day event from its start day to its due day. Recurring tasks appear at their current due date only.

| Method | Path | |
|---|---|---|
| GET | `/api/profile/task-feed` | `{ enabled }` |
| POST | `/api/profile/task-feed` | new address: `{ enabled: true, path }` |
| DELETE | `/api/profile/task-feed` | `{ enabled: false }` |
| GET | `/api/feeds/tasks/:token.ics` | the feed, no sign-in; 404 for an unknown token |

## Calendar page: task blocks

How a task is drawn on `/calendar` (`frontend/components/Calendar/taskEvents.ts`):

- **Due time, start time earlier the same day:** a block from the start time to the due time. Dragging its bottom edge changes the due time.
- **Due time otherwise:** a block that starts at the due time and lasts the task's estimate, or one hour without an estimate. Dragging its bottom edge sets the estimate, in 15-minute steps, between 5 minutes and 12 hours.
- **Whole-day due date:** a bar in the all-day row of the week and day views, from the start date (when it is earlier) to the due date. In the month view the bar appears in each day it covers, on the same row all week. A due time with a start on an earlier day is also drawn as a bar.
- **Defer until:** a one-hour block at that time, as before.
- **Recurring tasks:** the task sits at its current due date, and its later occurrences up to the end of the loaded window (the month, padded a week each side) are drawn in a lighter blue. They come from `GET /api/tasks?type=calendar&end=YYYY-MM-DD`, which adds `is_virtual_occurrence` copies of each open recurring task, skipping days that already have a generated instance. A later occurrence cannot be moved or resized: move the current one, and the rest follow its new date.

Moving a block keeps its length: a start-to-due block moves both ends, a bar moves its start and due dates by the same number of days and keeps their times. Dropping on an hour of the week or day view sets the time; dropping in the month view or the all-day row keeps it.

## Calendar page: views

**Year**, Month, Week, **N days**, Day and **Agenda**.

- **Year** shows the twelve months as small grids; each day is shaded by how many items it has (whole-day bars count on every day they cover; later recurring occurrences count only inside the loaded month window). Clicking a day opens it in the Day view; the arrows move by a year.

- **N days** is the week grid for 2 to 7 days starting on the current date (View options → *Days in multi-day view*, `ui_settings.calendar.multiDayCount`, 3 by default). The arrows move by that many days. With weekends hidden it counts working days only.
- **Agenda** lists the month day by day, each day that has something on it under its own heading, whole-day items first. It opens scrolled to today, or the next day with items; the arrows move by a month.

The printer button prints only the shown view, without the sidebar and toolbar.

## Calendar page: View options

The sliders button next to the view switcher opens **View options**, saved per user in `ui_settings.calendar` (`PUT /api/profile/ui-settings` with `{ calendar: {...} }`):

- **Show completed** (`showCompleted`, on by default): done tasks stay on the calendar in green.
- **Show weekends** (`showWeekends`, on): off drops Saturday and Sunday from the month and week views, and the day view steps over them.
- **Show all repeats** (`showRepeats`, on): off keeps each recurring task at its current due date only.
- **Show habits** (`showHabits`, on): each habit appears as a purple whole-day item on every day it asks for a check-in, from today up to the end of the loaded window (at most 62 days); off hides habits. `GET /api/tasks?type=calendar&end=` adds those days as `is_virtual_occurrence` copies of the habit.
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
| `daily_plans`            | One row per user per local date (`plan_date`), with `started_at` set when the first task is placed                                |
| `daily_plan_items`       | The tasks in a plan: `position`, `start_minute` (minutes after local midnight, null for untimed) and `duration_minutes` |
| `daily_plans.ai_wrap_up` | The stored AI wrap-up for that day (JSON, optional)                                                                     |
| `calendar_feeds`         | Name, color, encrypted URL, host, last fetch time and last error, and `show_on_calendar`                                |

Plans and feeds are not included in backups: plans are short-lived, and feed addresses are encrypted with this server's key.

---

## API

| Method                | Path                                     | Notes                                                                                                                                                                                        |
| --------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                   | `/api/daily-plan?date=`                  | `{ date, day_hours, plan }`, the plan or `null`. The date defaults to today in the user's timezone                                                                                           |
| GET                   | `/api/daily-plan/candidates`             | `{ tagged_today, overdue, due_today, in_progress, suggested, suggested_total, inbox, inbox_count, ranked }`, each task in one group only; `ranked` lists task uids in the user's order. `?suggested_limit=N` (1 to 1000) sends up to N suggestions instead of the Planning setting; 400 otherwise |
| GET                   | `/api/daily-plan/ranking`                | `{ order, default_order }`, the ten bucket keys such as `overdue:project`                                                                                                                  |
| PUT                   | `/api/daily-plan/ranking`                | Body `{ order }` with every bucket key once; 400 otherwise                                                                                                                                   |
| GET                   | `/api/daily-plan/hours`                  | `{ start, end }` in minutes after local midnight                                                                                                                                             |
| GET                   | `/api/daily-plan/suggestions`            | `{ settings, defaults, options }` for the suggested group (see above)                                                                                                                        |
| PUT                   | `/api/daily-plan/suggestions`            | Body with any of the settings; unknown keys or values, and projects the user cannot see, give 400                                                                                            |
| PUT                   | `/api/daily-plan/hours`                  | Body `{ start, end }`, 30-minute steps, start before end, end at most 1440; 400 otherwise                                                                                                    |
| PUT                   | `/api/daily-plan/:date`                  | Replaces all items: `{ items: [{ task_uid, start_minute, duration_minutes }] }`, in order. Rejects overlaps, slots past midnight, duplicates and tasks the user cannot see                   |
| POST                  | `/api/daily-plan/:date/start`            | Marks the day started                                                                                                                                                                        |
| POST                  | `/api/daily-plan/:date/carry-over`       | Appends `{ task_uids }` to that day's plan without a time, skipping tasks already there                                                                                                      |
| DELETE                | `/api/daily-plan/:date`                  | Clears the plan. `:date` may be `today`                                                                                                                                                      |
| GET/POST/PATCH/DELETE | `/api/calendar-feeds[/:uid]`             | Manage feeds. POST fetches the feed once and refuses it if it cannot be read. PATCH also takes `show_on_calendar`                                                                            |
| GET                   | `/api/calendar-feeds/events?date=`       | `{ date, events, errors }` for that day                                                                                                                                                      |
| GET                   | `/api/calendar-feeds/events?start=&end=` | `{ start, end, events, errors }` for up to 62 days; each event carries its `date`, and a multi-day event appears once per day. Hidden calendars are included, the Calendar page filters them |

`GET /api/daily-plan` and `GET /api/daily-plan/candidates` also take the Focus scope params `area_uid`, `project_uid` and `tags` (see [Focus](25-focus.md)). Candidates are then narrowed to the scope. The plan keeps every item, since `PUT /api/daily-plan/:date` and carry-over replace the whole list from what the client holds, and marks each item `in_focus: true|false` instead; Today and the planner dim the ones outside the Focus.

---

## AI help

Everything in this section appears only while the **AI assistant** is switched on for the user (Profile → Features), the same switch as the Daily Brief. With it off the planner and Today look exactly as described above, and the AI endpoints return `403`.

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
- Unfinished tasks are not carried over to the next day's plan.
- There are no MCP tools for the plan yet.
