# Upcoming View - Behavior Rules

This document explains how the Upcoming view works in Cadence. For technical implementation details, see `/backend/modules/tasks/queries/query-builders.js` and `/backend/modules/tasks/recurringTaskService.js`.

---

## Overview

The **Upcoming view** is a forward-looking calendar that shows tasks scheduled for the next 7 days, organized by date. It differs from the Today view by showing all upcoming work rather than just today's active tasks.

**Key characteristics:**
- Shows tasks due in the next 7 days
- Grouped by day of the week
- Displays recurring task occurrences
- Includes deferred tasks whose defer date falls in the window
- Shows upcoming projects

**URL:** `/upcoming`

---

## Plan page: Horizons mode

The fork's « Planifier » board (`/upcoming`) has a **Horizons** mode: This week, Next week, This month, Next month, Someday. A task lands in the first horizon that applies (`bucketHorizons` in `frontend/components/Upcoming/horizons.ts`):

1. **Someday**: tagged `#someday`, whatever else it holds.
2. **Its commitment**, when it still holds: `week_of` = this week → This week; `week_of` = next week → Next week; `month_of` = this month → This month; `month_of` = next month → Next month.
3. **Its date, derived** (nothing is written: `week_of` and `month_of` stay empty): its earliest plan line from the first day of this week on, otherwise its due day from today on. A day of this week → This week; a later day of this month → This month; a day of next month → Next month. A task planned on a day of this week shows in This week under « Planned on a day » rather than among the cards. A recurring task's due date is its next occurrence and derives nothing.

A past week or month, a past due day (overdue: the days layout's « En retard » band) or a plan on an earlier week decides nothing: such a task is in no horizon. Each horizon column is framed (a light surface and a hairline), like the inbox, so the five read as separate places. Plan lines count for the days the board has loaded. Dropping a card on another horizon writes `week_of`, `month_of` or `#someday` as before; the derived date is left alone. Next week is only ever a commitment (`week_of = next week`): a derived date never lands there.

### Day strip

A day column's header shows the day, its date, and only once something is planned: the card count, the load against the day's hours (« 2 h 30 / 10 h », red when over) and the done bar. An empty day stays blank (« Rien de prévu. » is read by screen readers only), so the cards are what the eye meets; a horizon column likewise, keeping « N planifiées un jour » when it applies. The inbox's « Glisser sur un jour pour le planifier » and the horizons' descriptions are tooltips on their titles, no longer lines.

In the days layout the left column lists, in time order, everything that has no day yet (since 2026-11-19; it replaces the strip under the days and the week and month groups of « À planifier »): « En retard », « À replanifier » (only when some task's week or month has passed), the inbox, then one section per horizon: Cette semaine, Semaine prochaine, Ce mois-ci, Le mois prochain, Un jour (`HorizonColumn` with `collapsible`). A task already on a day of the board (planned there, or due there) is not listed again. Each section folds from its title (kept per browser, `upcoming.leftCollapsed.<horizon>`; Un jour starts folded), takes dropped cards and gives its cards to a day (drag, or t / Shift+T on a focused card). A drop on a section takes the card off its day's plan and writes the horizon (`week_of`, `month_of`, `#someday`), the due date kept, one undo; from one section to another only the commitment changes. Shift+W sends the focused card to Semaine prochaine, Shift+M to Ce mois-ci, and the right-click menu offers the same targets. The inbox no longer folds into a bar in Days (it does in Horizons).

### « À planifier » (Days layout)

The inbox column is 260 px wide by default and widens or narrows from the handle on its right (drag, arrow keys, Home / End; a double click brings back 260 px): 220 to 560 px, and never so wide that the board loses its day and a half of columns or, when the calendar sits beside it, the narrowest calendar. The width is kept per browser (`upcoming.inboxWidth`); « À planifier » below follows it. Web only: the phone shows one column. The inbox and « À planifier » scroll as one list in that column; each header sticks at the top while its part is in view.

Beside the board, the calendar needs the window to be 1180 px or more and the board to keep the inbox, a day and a half of columns and the narrowest calendar (280 px); otherwise it is a drawer (`calendarPlacement`, `minBoardWidth` in `boardDates.ts`). A 1500 px window with the sidebar open keeps it beside the board.

The « Cette semaine » section's header shows the rest of this week: « 6 h 30 / 35 h », the open plan lines from today to the last day of the week against each day's hours (`weekLoad.ts`, `WeekLoadBadge.tsx`; a day not loaded counts its usual hours), red when over.

Several cards can be picked with Ctrl, Cmd or Shift click (Days layout only, `pickedCards.ts`): a picked card is tinted, a bar at the bottom says « Sélection : N » with Aujourd'hui, Demain, Semaine prochaine, Ce mois-ci and ✕. Dragging a picked card onto a day or a horizon moves the whole selection; on a picked card t, Shift+T, Shift+←/→, Shift+W and Shift+M act on all of it. One write per day touched, one Undo; Escape or ✕ clears. N anywhere on the page (not in a field or a dialog) opens the inbox's add field. All the board keys are listed in the `?` help under « Sur la page Planifier » (`shortcutRegistry.ts`, group `plan`).

In the header, « Aujourd'hui » is never greyed out: on today it brings today's column back into view (`aria-current="date"`). The calendar button reads « Calendrier » next to its icon, pressed while the calendar shows.

On Plan's left column only its « À replanifier » group is shown now (the week and month tasks are in their horizon sections). The rule, shared with Android: a box « À planifier » (`ToPlanBox.tsx`, rule `toPlan` in `horizons.ts`; Android `PlanBoard.toSchedule`), open top-level tasks without #someday:

- **À replanifier** (first, red): not recurring, `week_of` before this week or `month_of` before this month, placed in no horizon by `bucketHorizons`, and with no plan line today or later. A task already shown elsewhere is left out: overdue (non-recurring, due before today: « En retard » / « Échues ») or unsorted (no project and no area, or `needs_when`: « Tâches à classer »). Its chip then shows its red due date, not « À replanifier ».
- **Cette semaine**: `week_of` = this week, no plan line on a day of this week.
- **Ce mois-ci** (collapsed by default, count shown): `month_of` = this month (and not committed to this or next week), no plan line on a day of this week.

Plan lines count for the days the board has loaded. Cards drag onto a day (planned like an inbox card; the commitment stays). Right click (Android: long press, « Planifier » sheet): « Engager pour » Cette semaine, Semaine prochaine, Ce mois-ci, Mois prochain, Un jour, and « Retirer l'engagement » (clears `week_of` and `month_of`); Undo writes back the week and month held before. Shift+W / Shift+M and the strip work on its cards too. When all three groups are empty the box renders nothing at all (no header, border or bar). Collapsible on the web (`upcoming.toPlanCollapsed`): under a collapsed inbox it is a 44 px bar with its count. On the phone it is a section under the Inbox (placement chosen over a top banner or a list filter: one long press per task, no stacked sheet).

### « En retard » (Days layout, left column)

At the top of the left column, above the inbox (since 2026-11-19; it was a band above the days), the section lists the open tasks due before today with no plan line today or later (the filters apply), one card under the other, as wide as the inbox. It starts as one line (« En retard (N) » and the buttons) and opens on its chevron to show the cards; the choice is kept per browser (`upcoming.overdueCollapsed`, `'0'` = open). Its header has the plugin buttons of the `overdue` place (`docs/46-plugins.md`, Hermes « Proposer un plan ») and a split button. Every choice writes plan lines only (`add`), never the due date; today is reloaded so the band empties, and one Undo takes the lines back:

- **Replanifier** (`spreadOverdue.ts`; Android `PlanBoard.spread`, both replay `fixtures/plan/spread-overdue.json`): the tasks are sorted by priority (high, medium, low, none), then oldest due date (its first 10 characters; none last), then uid. Each may go to a day of its window from today: today and tomorrow for a high priority, today to today + 3 for a medium one, today to today + 6 otherwise; never before its start or defer day. With no such day in its window it goes to the first allowed day of the seven; a task allowed on none stays overdue. It goes to its lightest allowed day, the earliest on a tie, and that day's load grows by the task's minutes. A day's load is its plan lines (due-only cards do not count; done ones do), each counted by its task's estimated minutes, 30 without a positive estimate; every plan line counts, whatever the filters. Days the board has not loaded are fetched first. The toast names the last day used (« réparties jusqu'à samedi »); its tooltip states the rule.
- **▾** (« Toutes le même jour »): **Aujourd'hui**, **Demain** (every task of the band on that day), **Choisir une date…** (a month, days before today disabled).

### Week preview (« Planifier ma semaine », web)

A ready week proposal (`docs/47-proposals.md`) opens on the Plan board itself, not in a dialog: a third tab « Planifié par l'IA » appears next to Jours and Horizons once a week proposal is ready, and shows it (`?proposal=<uid>`; a link to it from another page leads there). Jours or Horizons leave it, and the proposal stays ready for later. While it shows, the layout is Days, the board moves to the proposed period, and the side calendar makes room for more days (`useWeekPreview.ts`, `WeekPreview.tsx`, pure rules `weekPreview.ts`). Without an agent listening (no running plugin and no enabled webhook for `proposal.requested`: `GET /api/proposals` › `agent`), neither the tab nor « Planifier ma semaine (IA) » shows.

- **Banner** above the board: « Proposition de l'IA », the headline and subtitle, the questions as chips, the effect (« Déplacées : 7 · Faites : 1 »), « Ignorer », « Appliquer (N) » (« Envoyer » once a question is answered). Nothing is written before it; the agent is never named, only « IA ». Pending: « L'IA prépare ta semaine… »; failed: « Réessayer ».
- **Cards**: a task the AI moves shows as a violet card where it goes (name; « ← where it was · duration »; the reason set apart under a line) and as a dashed trace where it is now (« → where it goes »). Hovering or focusing one surrounds both with a soft violet halo; nothing changes size (the columns leave room for the halo). Each day column also lists that day's agenda events (`days[].events`) and shows its load before → after.
- **Left column**: Cette semaine, Semaine prochaine, Ce mois-ci with their tasks, the traces of those leaving and the cards arriving, counts before → after; Le mois prochain and Plus tard list only what the AI moves in or out. Each list folds from its title (kept per browser, `upcoming.previewCollapsed.<horizon>`). « À planifier » is hidden meanwhile.
- **Deciding**: a click on a card or a trace opens its menu: « Voir la tâche » (the task sheet), « Refuser : la garder où elle est » (or « Revenir au choix de l'IA »), « Marquer comme faite », « Abandonner », each day of the period, each horizon. A card drags onto a day or a horizon; so does a task of the proposal shown as a normal card. These change the proposal only; « Appliquer » sends every decision at once (`POST …/apply`, or `…/send` with the answers).
- Android keeps its sheet for now (`TODO.md`).

### Due chip of the task sheet

The date picker of the task sheet's due date has a « Plus tard » row: Cette semaine · Semaine prochaine · Ce mois-ci · Mois prochain · Un jour; its « Semaine prochaine » quick choice (next Monday) is gone there (other date pickers keep it). A horizon is one write: `horizonPatch` semantics (the other commitment null, `later` for Un jour, `later:false` when leaving #someday), due date and time cleared, and the task leaves every plan from today on (`PATCH /task` `unplan: true`, `daily-plan/service.js` `takeTaskOffPlansFrom`; Android through its plan write queue, offline included). A precise day clears `week_of`, `month_of` and #someday. Without a date the chip shows the commitment (violet) or « À replanifier » (red) when its only week or month has passed.

### Android

The phone's « Planifier » (Tâches › title selector, was « À venir ») shows the same board in one column: Inbox (Tâches à classer, then ideas; « Ajouter » creates a task), Échues (« Tout à aujourd'hui » plans them today), then 14 days with their load, or the four horizons with « Prévues un jour » under This week. A long press opens « Planifier »: a day (plan ops: `move`, `add`, or `slot` + `remove` for a slotted card, never the due date), a horizon (`week_of`, `month_of`, `#someday`), « Retirer de ce jour », or the usual menu; an idea planned this way becomes a task first. Day members and horizons follow the same rules (`planning/PlanBoard.kt`); the plans of the 14 days are read after each sync and kept on the device, so the board works offline and every write is queued.

Android also has the Next week horizon, the « À planifier » section under the Inbox and the « Plus tard » row of the task date sheet, with the same rules (1.25.0, tests `PlanCommitmentsTest`).

Android 1.27.0 catches up with the web: a day card sent to a horizon from its « Planifier » sheet leaves its day (its plan line is removed, the due date stays, one undo: `PlanBoard.sendToHorizon`, like `leaveDayWrites`); a « Plus tard » strip under the 14 days lists Semaine prochaine, Ce mois-ci, Mois prochain and Un jour with their counts and opens Horizons on one. The Inbox « Ajouter » and a day's « Ajouter » never set a due date (`PlanBoard.planAdd`, like `addToInbox` / `addTask`): a named date, or a time alone (today), plans the task that day (slotted at the time); otherwise a day's « Ajouter » plans it on that day and the Inbox one leaves it in « Tâches à classer », with `needs_when` when a project or area files it. Échues has « Replanifier ▾ » (Aujourd'hui, Demain, Étaler sur 7 jours, Choisir une date; plan writes only) and the plugin buttons of the `overdue` place. « Étaler sur 7 jours » is `PlanBoard.spread`, replaying `fixtures/plan/spread-overdue.json` (since 2026-11-19 the same windows by priority and start or defer day as the web's « Replanifier »); a day's load is its plan lines (not due-only cards), each counted by its estimated minutes (30 without a positive estimate). Unsorted tasks are planned on a day by the long press sheet, not by dragging: one column has no room for drop targets.

## Basic Rules

1. **Time range is 7 days ahead**
   - Starts today at midnight (your timezone)
   - Ends 7 days from now at 11:59 PM (your timezone)

2. **Grouped by day, not by status or project**
   - Tasks organized into columns/sections by due date
   - Labels: "Today", "Tomorrow", "Monday, March 17", etc.
   - Deferred tasks without a due date appear in a "No Due Date" section

3. **All tasks are loaded at once**
   - No "Load More" or pagination
   - Shows complete 7-day view

4. **Recurring tasks show as multiple occurrences**
   - Each occurrence appears on its due date
   - Same task can appear on multiple days
   - These are "virtual" previews generated on-the-fly

5. **Cannot create new tasks from Upcoming view**
   - "New Task" button is hidden
   - Create tasks from Inbox, Today, or specific projects instead

---

## What Tasks Appear in Upcoming

### Tasks Included

Upcoming lists only your own work: tasks assigned to you, and tasks you own that are not assigned to another member. A task you assign to another member shows on their Upcoming, not yours. Tasks you see only through a shared project or area stay on that page (see [Today Page Sections](02-today-page-sections.md)).

A task appears in Upcoming if it matches **any** of these conditions:

1. **Regular tasks with due dates**
   - Due date falls within the next 7 days
   - Not marked as completed (unless viewing completed tasks)

2. **Tasks becoming available from deferral**
   - "Defer Until" date falls within the next 7 days
   - Still placed by due date, not by defer date (see [Defer Until Behavior](#defer-until-behavior))

3. **Recurring task occurrences**
   - All occurrences of recurring tasks in the next 7 days
   - Generated automatically from the recurring pattern
   - Each occurrence appears on its scheduled date

4. **Deferred tasks without due dates**
   - Appear in the "No Due Date" section
   - Only tasks picked up by rule 2; undated tasks that are not deferred into the window do not appear

### Tasks Excluded

**Tasks that don't appear:**

1. **Overdue tasks** (due before today)
   - Past-due non-recurring tasks don't appear
   - Exception: Recurring tasks continue showing future occurrences

2. **Future tasks** (due more than 7 days ahead)
   - Only shows the next 7-day window
   - Tasks due next month won't appear

3. **Completed tasks, when the "Active" filter is selected**
   - The default filter is "All", which includes completed tasks
   - Can toggle between Active/Completed/All

Subtasks are included: the view requests `include_subtasks=true`, so a subtask with a due date in the window appears on its own day like any other task.

---

## How Recurring Tasks Work in Upcoming

### Virtual Occurrences

Recurring tasks appear as **virtual occurrences** - previews of future instances:

1. **Each occurrence gets its own date**
   - A daily task appears 7 times (once per day)
   - A weekly task appears 1-2 times (depending on the week)
   - A monthly task appears 0-1 times (if it falls within 7 days)

2. **Occurrences are generated automatically**
   - Based on the recurring pattern (daily, weekly, monthly, etc.)
   - Respects the recurrence interval (every 2 days, every 3 weeks, etc.)
   - Stops at the recurrence end date (if set)

3. **Each occurrence can be acted on independently**
   - Click to view details
   - Mark as complete
   - Edit the parent task (affects all future occurrences)

### Recurrence Patterns

**Patterns shown in Upcoming:**

- **Daily**: Every N days
  - Example: Every 2 days shows on Day 1, Day 3, Day 5, Day 7

- **Weekly**: Every N weeks on specific day(s)
  - Example: Every Monday shows next Monday (and following Monday if within 7 days)
  - Example: Mon+Wed+Fri shows 3 occurrences per week

- **Monthly**: Every N months on specific day
  - Example: 15th of every month (only appears if within 7 days)

- **Monthly Weekday**: Every N months on specific weekday
  - Example: 2nd Thursday of every month

- **Monthly Last Day**: Last day of every month

### Overdue Recurring Tasks

If a recurring task is overdue:
- The system automatically advances to the next future occurrence
- Past-due occurrences are skipped
- Only upcoming occurrences appear in the view
- The missed occurrence still shows as overdue on Today and in the task lists until you complete it

**Example:**
- Recurring task: "Weekly Report" every Monday
- Today: Wednesday, March 12
- Last completed: Monday, March 3 (overdue)
- **Shows in Upcoming**: Monday, March 17 (next occurrence)
- **Doesn't show in Upcoming**: Monday, March 10 (past, shows as overdue instead)

---

## Grouping and Organization

### Day-Based Grouping

Tasks are organized into date columns/sections:

**Group Labels:**
1. **"Today"** - Tasks due today
2. **"Tomorrow"** - Tasks due tomorrow
3. **"[Weekday], [Date]"** - Other dates (e.g., "Monday, March 17")
4. **"No Due Date"** - Tasks without due dates

**Languages:**
- Group labels are translated into all 25 supported languages
- Date formats respect your locale settings

### Within Each Day

Tasks are sorted by:
- Selected sort order (due date, priority, name, etc.)
- Default: Creation date (newest first)

**Sort options available:**
- Due date (earliest or latest first)
- Priority (high to low, or low to high)
- Name (A-Z or Z-A)
- Status (by completion state)
- Created date (newest or oldest first)
- Completed date (for completed tasks)

### No Project Grouping

Unlike the main Tasks view:
- Cannot group by project
- All tasks mixed together by date
- Projects shown separately below the task list

---

## Status Filtering

### Filter Options

You can filter what appears in Upcoming:

1. **All** (default, no `status` in the URL)
   - Shows both active and completed tasks
   - Mixed view of everything

2. **Active**
   - Shows only open tasks
   - Excludes done, archived and cancelled tasks

3. **Completed**
   - Shows done and archived tasks whose due date falls in the 7-day window
   - It is not a history of the past week: a task due next Tuesday that you already finished shows here, one finished yesterday does not

### How to Filter

- Open the sort dropdown in the toolbar and pick an option under "Show"
- Selection is saved to URL (can bookmark)
- Changes immediately update the view

---

## Defer Until Behavior

### How Deferred Tasks Appear

A defer date in the window makes the backend fetch a task, but the view always places tasks by **due date**:

1. **Deferred into the window, due inside the window**
   - Appears on its due date
   - The same would happen without the defer date

2. **Deferred into the window, no due date**
   - Appears in the "No Due Date" section
   - This is the only way an undated task reaches Upcoming

3. **Deferred into the window, due after the window**
   - Does not appear: grouping drops every task due after the last day

4. **Deferred beyond the window**
   - Appears only if its due date is in the window (it is then fetched by its due date, like any task)
   - Otherwise it does not appear until the defer date is within 7 days

### Example Scenarios

**Scenario 1: Deferred, no due date**
- Task: "Review contract"
- Due date: none
- Defer until: March 15
- Today: March 12
- **Shows in Upcoming:** Yes, under "No Due Date"

**Scenario 2: Deferred, due after the window**
- Task: "Q2 planning"
- Due date: April 1
- Defer until: March 14
- Today: March 12
- **Shows in Upcoming:** No (due date is beyond the 7-day window)

---

## Upcoming Projects

### What Projects Appear

Projects show separately at the bottom of Upcoming if:
- Project has a due date set
- Due date falls within the next 7 days
- Project status is not done or cancelled

### Project Display

- Shown in an "Upcoming Projects" list below the tasks
- Sorted by due date
- Click to view project details

---

## Special Features

### Responsive Layout

**Desktop (wide screens):**
- Horizontal columns for each day
- Board-style layout
- Tasks arranged left to right across the week

**Mobile (narrow screens):**
- Vertical stacked sections
- One day at a time
- Scroll down to see future days

### No Search

- Search bar is hidden in Upcoming view
- Use main Tasks view or Inbox for searching
- Upcoming is for browsing by date only

### No Pagination

- All tasks for 7 days load immediately
- No "Load More" button
- Fast loading optimized for weekly view

### Auto-Refresh

The Upcoming view automatically refreshes:
- When you complete a task
- When you change task status
- When you edit a task's due date

---

## Differences from Today View

| Feature | Today View | Upcoming View |
|---------|------------|---------------|
| **Time range** | Only today | Next 7 days |
| **Grouping** | By section (Planned, Overdue, etc.) | By date |
| **Status focus** | Active tasks only | All tasks (filterable) |
| **Recurring display** | Parent + today's instance | All virtual occurrences |
| **New task creation** | Available | Not available |
| **Search** | Available | Not available |
| **Pagination** | Yes (Load More) | No (all loaded) |
| **Layout** | Vertical list | Board layout |

---

## User Settings

### Configurable Options

| Setting | Default | How to Change |
|---------|---------|---------------|
| **Status filter** | All | "Show" options in the sort dropdown |
| **Sort order** | Created date (newest) | Sort dropdown in toolbar |
| **Sort direction** | Descending | Toggle in sort dropdown |

### Saved Preferences

- **Sort order**: Saved to browser localStorage
- **Status filter**: Saved to URL (can bookmark)
- **Mobile/Desktop**: Auto-detected from screen size

---

## Common Use Cases

### 1. Planning Your Week

**What to do:**
- Open Upcoming view on Monday morning
- Scan across all 7 days
- See what's coming and when
- Reschedule overloaded days

### 2. Checking Recurring Tasks

**What to do:**
- Look for recurring tasks appearing multiple times
- Verify the pattern is correct
- Edit parent task if pattern needs adjustment

### 3. Finding Available Tasks

**What to do:**
- Check the "No Due Date" section
- It lists undated tasks you deferred into this week
- Plan when to work on them

### 4. Reviewing Completed Work

**What to do:**
- Switch to "Completed" status filter
- See which tasks due this week are already done

---

## Example Scenarios

### Scenario 1: Daily Recurring Task

**Setup:**
- Task: "Morning workout"
- Pattern: Every day at 7 AM
- Today: Monday, March 10

**Shows in Upcoming:**
- Monday, March 10: Morning workout
- Tuesday, March 11: Morning workout
- Wednesday, March 12: Morning workout
- Thursday, March 13: Morning workout
- Friday, March 14: Morning workout
- Saturday, March 15: Morning workout
- Sunday, March 16: Morning workout

**Total appearances:** 7 times (once per day)

### Scenario 2: Weekly Multi-Day Recurring Task

**Setup:**
- Task: "Team standup"
- Pattern: Every Mon, Wed, Fri
- Today: Monday, March 10

**Shows in Upcoming:**
- Monday, March 10: Team standup
- Wednesday, March 12: Team standup
- Friday, March 14: Team standup
- Monday, March 17: Team standup

**Total appearances:** 4 times

### Scenario 3: Deferred Task Becoming Available

**Setup:**
- Task: "Review proposal"
- Due date: March 15
- Defer until: March 14
- Today: March 10

**Shows in Upcoming:**
- Saturday, March 15: Review proposal
- (Placed on its due date, not on the defer date)
- (With a due date of March 25 it would not appear at all)

### Scenario 4: One-Time Task with Due Date

**Setup:**
- Task: "Submit report"
- Due date: March 15
- Today: March 10

**Shows in Upcoming:**
- Saturday, March 15: Submit report

**Total appearances:** 1 time (not recurring)

---

## Troubleshooting

### "My task doesn't appear in Upcoming"

**Check these:**
1. Is the due date more than 7 days away? (Only shows next 7 days)
2. Is the due date in the past? (Overdue tasks don't appear)
3. Is it marked as completed? (Switch the filter to "All" or "Completed")
4. Is it deferred? (It still shows on its due date; with no due date it is under "No Due Date"; due after the window it does not show)
5. Does it have no due date and no defer date in the window? (Undated tasks only appear when deferred into the window)

### "My recurring task shows too many times"

**This is normal if:**
- Pattern is daily (shows 7 times)
- Pattern is multi-day weekly (shows multiple times per week)

**To reduce occurrences:**
- Increase the recurrence interval (every 2 days instead of daily)
- Change to single-day weekly pattern
- Set a recurrence end date

### "My recurring task doesn't show at all"

**Check these:**
1. Is the recurrence end date in the past? (Task stopped recurring)
2. Is the task completed and not advancing? (Check completion-based setting)
3. Is the next occurrence beyond 7 days? (Monthly tasks may not appear)

---

## Related Documentation

- [Recurring Tasks Behavior](01-recurring-tasks-behavior.md) - How recurring tasks work
- [Today Page Sections](02-today-page-sections.md) - How Today page differs from Upcoming
- [Architecture Overview](architecture.md) - Technical architecture
- [Development Workflow](development-workflow.md) - Working with the codebase

**Technical Implementation Files:**
- Backend query builder: `/backend/modules/tasks/queries/query-builders.js`
- Recurring task service: `/backend/modules/tasks/recurringTaskService.js`
- Frontend component: `/frontend/components/Tasks.tsx`
- Grouping logic: `/backend/modules/tasks/operations/grouping.js`

---

**Document Version:** 1.1.0
**Last Updated:** 2026-09-22
**Audience:** Developers, AI assistants, and end users
