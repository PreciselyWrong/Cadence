# Today and Daily Plan

Today is for **doing** the day: a list of what is planned or due that day, next to a calendar where you place tasks between appointments. Plan, its neighbour, is for **distributing**: where each task goes, this day, this week or "someday". This page describes both, as well as the rules of the daily plan.

![Today: the day's list and its calendar](images/web/today.png)

## The Today page

### What you see

From top to bottom, in the left column:

1. **The header**: a big title ("Today", or "Tomorrow", "Yesterday", otherwise the day's name) with the date beside it, the day arrows, the "Today" button and, on the right, the page's actions (see below).
2. **A summary line**: "8 tasks · 4 h 40" (the number to do and the estimated time). When the day overflows, it becomes "4 h 40 planned for 3 h 50 free", in amber; the detail ("needed · free") is in the tooltip. There is no gauge.
3. **The "Add a task" field**: the task is added **to the displayed day**, with no due date. It reads dates, priorities and tags like quick capture (see [Inbox and Capture](Inbox-and-Capture)).
4. **"Overdue · N"**, collapsed, only if there are overdue tasks.
5. A discreet alert banner when a slot has been passed (see "The order of the day").
6. **"To place · N"**: the day's tasks without a time.
7. **"My day"**: the timeline, with the current time, appointments and free slots.
8. **"Habits · N"** (see below), **"Tomorrow · N"**, **"Suggestions · N"** and **"Done · N"**, collapsed.

Collapsible sections start **closed** (only "Habits" starts open) and remember their state in this browser: Today shows only the day.

### Which tasks are in "the day"

A single server function answers for the web, Android and agents:

- the tasks **planned** on that day (a plan row);
- plus the **open tasks due that day** that are planned on no other day from today.

Each task appears **only once**. A subtask whose date falls on that day is listed under its parent task's name. A completed recurring task is shown as done for the day's occurrence, then the same task moves to its next date.

### A day row

A row shows the time (minutes in small), the round checkbox, the title, then a row of chips: project, two tags, duration and end time ("30 min → 9:30") or duration and due date. The task **in progress** is tinted. Nothing appears on a simple hover; actions come on right click, or from the "⋯" button of the selected row.

- **Clicking a row or a calendar block** opens the panel **below the page** (`?task=`); the row stays selected. A click on an agenda event opens its read-only panel (see [Agenda and Calendar](Agenda-and-Calendar)).
- The **row menu** (right click) offers: "Plan at the next free time", "Remove the time", "Move to tomorrow", "Move to next week", "Take off this day", "Open", then the common task menu (see [Tasks](Tasks)).
- The **"Details"** button in the header unfolds, under each row, the description and the subtasks.
- **"Hide completed"** ("⋯" menu) hides what is done, including habits already done.

## The day bar and the arrows

The header contains the page's only date navigation: **"Previous day"**, **"Next day"** and **"Today"**. The visible date is the one in the address (`?date=`), shared between the list and the calendar: both always show the same day.

- The "Today" button is **always there**, greyed out when you are already on today. Before, it only appeared on another day and the bar jumped at each change; it no longer moves.
- The arrows keep their place whatever the length of the day's name: the title reserves the width of the longest name, so the pointer stays on the arrow when clicking several times in a row.
- On another day, the title says "Yesterday", "Tomorrow" or the day's name. "Nothing planned for this day." is shown if the day is empty; today, an empty day suggests adding a task or taking one from the suggestions.
- The "Overdue", "Tomorrow" and "Suggestions" folds only concern **today**; other days do not show overdue tasks.

## The day calendar

On the right, a calendar shows **1, 3 or 7 days** from the open day ("Days shown" selector). It is resized with the separator handle (width remembered) and hidden with "Hide the calendar"; the "Calendar" button brings it back.

- **Where it is placed**: beside the list in a window of at least about 1180 px and as long as both columns keep their minimum width; otherwise it is a drawer covering the list. On a phone, a "Calendar" button and a "List" button switch between the two. For 7 days in a calendar that is too narrow, a message says "Too narrow for 7 days: widen the calendar or show fewer days".
- **The drawing**: a flat block in the project's colour for a task with a slot; a calendar colour for an event; protected time hatched; a task due at a given time without a slot is drawn **at its time, like an appointment** (it is often a real appointment typed as "tomorrow 3pm"); a red line for the current time, on today only.
- **The visible hours** follow the "Visible hours" option of the Calendar (see [Agenda and Calendar](Agenda-and-Calendar)): everything planned outside is shown in "N before" and "N after" bars; "Show all hours" unfolds them for the session, "Hide early and late hours" restores the saved window. The working hours set in the profile are dimmed around.
- **Several items at the same time** are placed side by side. A habit with a reminder that day is a thin mark at the reminder's time; a click opens the habit.

## The order of the day

### Times and order

The list first sorts the tasks **with a time** (slot or timed due date) in time order, then the others in plan order. "To place · N" groups those without a time, with first those whose time has **passed without being done** ("Scheduled 10:30": nothing disappears). "My day" alternates tasks and appointments in time order, with:

- a "Now" line at the current time;
- the past dimmed and the next thing highlighted;
- "At the same time" when a task overlaps an appointment;
- a **free slot** ("45 min free") with "Place N here" when tasks without a time fit in it.

### Arrange the day by hand

Drag a row onto another: it takes its place (synced field `today_order`). What is arranged by hand comes first, the rest follows time then ranking. On Android, the same thing goes through "Move up" and "Move down".

- **Reordering the rows that have a time reorders the day**: the tasks take turns at the day's times, each after the previous one and away from appointments and protected time.
- A row without a time dropped among them receives a slot; a row with a time dropped among the others loses it.
- **Dragging a row onto the calendar** gives it a slot (a task planned on another day moves to this day). Slots advance in 15-minute steps. Dragging a block moves it; pulling its bottom edge resizes it (duration of **this plan row only**: the task's estimate does not change); putting it back on the list removes its time. With the keyboard, Shift or Alt + arrows on a selected block.
- Dragging has safeguards: "Overlaps" and "In the past" are shown when you drop on a refused spot.

### When a slot has been passed

When the end time of an uncompleted task has passed, a banner says "*name* has passed its slot" with **"Shift the rest"** (the task resumes now and the following ones shift just as much as needed) and **"Later"** (this task alone is replaced at the next free slot, otherwise without a time). Both offer "Undo".

### Organize

The **"Organize"** button (visible when tasks without a time fit in the free time) places each task without a time in the free time of working hours, **in the list's order**, around events, protected time and appointments; on today, from now on. An "N tasks placed" message offers **"Undo"**, which restores the whole previous plan. A task that fits nowhere stays without a time.

## The daily plan: five notions, five fields

Cadence distinguishes what other tools mix up. Nothing in Today changes the due date: dragging, resizing, postponing and organizing only touch the plan.

| Notion | Data | Written by |
|---|---|---|
| Planned day | That day's plan row | Add to the day, postpone, take off the day |
| Due date | `tasks.due_date` (and the time) | Only the "Due" field (panel, menu) |
| Slot | The plan row's time | Drag in the calendar, move, remove the time |
| Duration | The task's estimate, copied into the row | Resize a block (row only), duration chips, panel |
| Reminder | `reminder_at` | The panel |

### Rules to know

- **A single planned day per task.** Putting a task on a day (from today) removes it from all other days from today. Past days keep their rows as history.
- **Removing the time keeps the task in the day**; **taking it off the day keeps the task** (it becomes "without a day" again).
- **Moving to tomorrow or to next week** moves the plan row (or plans a merely due task on that day); the due date never changes from this page, and a marker reminds you of the due date on its day. Every write offers "Undo".
- **Writes are atomic and protected.** Each change is applied on screen immediately and sent with the plan's fingerprint; if another device changed it in the meantime, the page reloads with "The plan changed on another device. It has been reloaded." rather than overwriting. A save failure rolls back ("Could not save. Nothing changed.").
- **A pushed-back due date takes the task out of the day.** A simple task whose due date moves to a later day leaves the plans of the days before the new due date (from today), whatever the origin of the change (panel, sync, agent). A plan from the new due date on stays, as does a past plan. For a recurring task or a habit, the "this occurrence or the series?" question offers "Also take it off my day" (ticked).
- **"Planning sets the due date" option** (Profile › Organization › Planning › Due date, off by default; Android: Réglages › Planification › Échéance (Settings › Planning › Due date)). When it is on, putting a task on a day (from today) also sets its due date to that day: end of day, or the same time on the new day if the due date had one. Recurring tasks, habits and closed tasks keep theirs. Turning it on aligns already planned tasks all at once; turning it off changes nothing. Only this direction exists: changing a due date elsewhere does not move the plan, except for the previous rule.

## Overdue tasks

The **"Overdue · N"** fold (today only) lists all open tasks whose due date has passed and that are planned on no day from today. Overdue tasks planned on a later day are also listed, with that day ("Planned Thu 28"). These are real task rows: checkbox, drag to the list or the calendar, menu with "Today". A task put on the day leaves the list.

- **"Do today"** on a row and **"Do all today"** plan them on the day without touching the due date.
- **"Replan"** opens a sheet where each overdue task gets a one-tap choice: Today, Tomorrow, Done, or "More…" (the next five days with their load, the horizons This week, Next week, This month, Later, "Pick a date…", "Drop"). Each choice is written immediately, the row keeps its choice and offers "Undo". A replaced task is no longer overdue: **this choice, unlike the page's gestures, changes the due date** (chosen day, or due date cleared for a horizon).
- **"All to tomorrow"** and **"Spread over 7 days"** (same rule as in Plan, below) process all tasks at once.
- A **recurring** task can only be completed ("Done") or skipped ("Skip this time"); a task from a `TODO.md` file cannot be dropped (see [TODO.md Projects](TODO-md-Projects)). "Drop" sets the task to "Cancelled".
- A lateness number is never shown as a reproach: the fold says "Overdue · 3", not "3 days".

## Tomorrow and Suggestions

- **"Tomorrow · N"** lists what is planned or due tomorrow (same function as for the day, with no duplicate in the list). "+" or a drag onto the calendar takes it for the displayed day.
- **"Suggestions · N"** groups what could come next (this week, "in view", the rest), without the tasks already in the day, overdue or in "Tomorrow". Each row shows its project and its first two tags as chips, the date, then "Add": you can see where the suggestion comes from without opening it. A routine due later is not suggested: it comes back by itself.
- What is suggested is set in Profile › Organization › Planning (see below).

## Habits of the day

A **"Habits · N"** section of the list shows the habits planned that day.

- **One tap** ticks a yes/no habit, or adds its first quick value (otherwise a unit), with "Undo" (a "Could not log the habit." message is shown on failure).
- Those that are done fold into **"Done · N"** and follow "Hide completed".
- A habit with a reminder that day is a thin mark on the calendar, at the reminder's time; a click opens the habit.
- Tracking details (streaks, values, pauses) are in [Habits](Habits). On Android, habits are in « Ma journée » (My day).

## What appears or disappears

| Case | Result |
|---|---|
| Task planned today | In "To place" or "My day" |
| Task due today, never planned | In the day (only once) |
| Task due today but planned tomorrow | In "Tomorrow", not today |
| Overdue task planned later | In "Overdue", with its day |
| Overdue task not planned | In "Overdue" |
| Task with no date or plan | Neither in the day nor in the folds, except as a suggestion |
| Task with an upcoming "Defer Until" | Absent until the postponement has come due |
| Completed task | In "Done · N" (50 most recent) or hidden |
| Task tagged `today` | It counts among the priority candidates of the suggestions |
| Task tagged `someday` (Later) | Never added to fill a list that is too short |
| Subtask with its own date | Under the parent's name |

## Settings

In Profile › Organization › Planning (Android: Réglages › Planification (Settings › Planning)):

- **Order** of candidates: ten groups (tagged "today", overdue, due today, in progress, the rest, each split into project tasks and tasks without a project), reorderable by drag or arrows; "Reset to default". Within a group: highest priority first, then the order of rows, then the due date, then most recently modified (or the most recent, or the oldest).
- **Suggestions**: suggested project statuses (default "In progress"), tasks without a project yes or no, projects never suggested, tasks unchanged for 3 or 6 months excluded, horizon of 1, 3 or 7 days, number of suggestions (10, 20 or 50). These filters only affect "the rest": overdue, due today or in-progress tasks are always shown.
- **Your day**: start and end hours (default 8 am to 6 pm, 30-minute steps); new tasks and AI drafts get a time there.
- **Due date**: "Planning sets the due date" (see above).
- **Morning replanning of overdue tasks (AI)**: a week proposal prepared at the chosen time when tasks are overdue (see [AI and Proposals](AI-and-Proposals)).
- **Focus time**: recurring blocks (days and hours, optional label) that "Organize", the "+" button and the AI draft never use, with exceptions (holidays, time off); you can still drag a task into them by hand. They are edited on Android in Réglages › Planification (Settings › Planning); on the web, from the previous Today page (see below).

### The previous page

The "⋯" menu of Today keeps the **"Previous Today page"** entry during the migration (`?classic=1`). It still carries the capacity gauge, "Place all", the "Start my day" guide, the evening review, the quote of the day ("Show the quote of the day") and focus-time editing.

## Plan

![Plan: inbox, days and horizons](images/web/plan.png)

**Plan** (sidebar or `g` then `u`) is a Todoist-style board: on the left everything that has no day yet, in the middle **one column per day** over two weeks, then a calendar on the right. A two-position switch toggles between **"Days"** and **"Horizons"**. Plan's writes touch the **plan**, never the due date (except choices explicitly about the date, as in the panel).

### The days board

- Each column shows the day, its date and, **only when something is planned**, the number of cards, the load ("2 h 30 / 10 h", in red beyond) and the "Done" bar. An empty day stays blank.
- The cards are task cards (checkbox, title, chips). Drag a card onto a day to plan it; onto a horizon to commit it; onto the sidebar to file it.
- **"Today"** is never greyed out: on today, it brings the day's column back into view. The "Go to date", "Previous/Next day", "Previous/Next week" buttons scroll.
- The **"Display"** button sets: Layout, Group by (None, Project, Priority, Tag), Sort by (Plan order, Time, Priority, Name, Project), "Completed tasks", "Inbox column", "Calendar days" and "Reset". **"Filter"** restricts by projects, tags or priority ("Clear filters").
- **Calendar**: beside the board from a 1180 px window when the board keeps its inbox column, one and a half day columns and the narrowest calendar (280 px); otherwise it is a drawer ("Close the calendar"). The **"Merged calendar"** button shows agenda events in the day columns, as cards (icon in the agenda's colour, title, time or "All day"), in time order among the tasks, and hides the side calendar.

### The left column, in time order

A single list, from most pressing to most distant (since 19 November 2026):

1. **"Overdue (N)"**: overdue tasks with no plan from today. It fits on one line ("Overdue (N)" and the buttons) and opens with a chevron. Its shared **"Reschedule"** button writes plan rows, never the due date, with a single "Undo":
   - sorting is by priority (high, medium, low, none), then by oldest due date;
   - a day of its **window**: today and tomorrow for a high priority, from today to today + 3 for a medium one, from today to today + 6 for the others; never before the task's start or postponement;
   - the **least loaded** day of the window is chosen (the earliest in case of a tie), the load counting each plan row's estimate (30 minutes without an estimate); with no possible day in its window, the task goes to the first allowed day of the seven; with none, it stays overdue;
   - the message names the last day used ("spread until Saturday").
   The **▾ "All on one day"** menu offers Today, Tomorrow or "Pick a date…". If an agent is listening, "Reschedule with AI" starts the week proposal (see [AI and Proposals](AI-and-Proposals)).
2. **"To replan"** (in red): tasks whose commitment week or month has passed, with no plan from today and placed in no horizon.
3. **"Pushed back"**: tasks moved three or more times in the last 30 days ("4× in 30 days"). A click opens a menu: Show the task, Do today, Break into steps, Later, Mark as done, Drop it, Keep as is. Each choice is a review decision and resets the counter to zero. Their cards elsewhere carry a "↻ 4×" badge. See [Review, Insights and Focus](Review-Insights-and-Focus).
4. **The inbox**: "to sort" tasks then ideas (see [Inbox and Capture](Inbox-and-Capture)). Its width is adjustable (220 to 560 px, double-click to return to 260 px).
5. **The horizons**: This week, Next week, This month, Next month, Someday. Each section folds by its title (state kept; "Someday" starts folded), receives dropped cards and gives them to a day. The "This week" section shows the load of the remaining week ("6 h 30 / 35 h").

A task already on a day of the board (planned or due) is not listed a second time.

### The horizons

A horizon is a **commitment without a fixed day**. In "Horizons" mode, five framed columns: This week, Next week, This month, Next month, Someday. A task falls into the first horizon that applies:

1. **Someday**: it carries the `someday` tag, whatever else it has.
2. **Its commitment**: `week_of` of this week (This week), of the next (Next week), `month_of` of this month or the next.
3. **Its date, deduced** (nothing is written): its oldest plan row since the start of the week, otherwise its upcoming due date. A day of this week gives This week; a later day of this month, This month; a day of the next month, Next month. "Next week" is always a commitment, never deduced.

A past week or month, a past due date or a plan on an earlier week decide nothing: the task is then in no horizon. Dropping a card on another horizon writes `week_of`, `month_of` or the `someday` tag, the deduced date remaining intact. The shortcuts **Shift+W** (next week) and **Shift+M** (this month), right click ("Send to a horizon ▸") and the drop strip do the same; the task then leaves its plan day, the due date is kept and a single "Undo" restores everything. From a task's panel, the **"Later"** row of the due date picker does the same.

Right click also offers **"Commit to"** (This week, Next week, This month, Next month, Someday) and "Remove the commitment".

### Place a task: "→ Sat 21"

A card of the inbox, of "This week", of "Next week" or of "This month" carries a small "→ Sat 21" button: the **first day of the board** whose free time (the day's hours minus open plan rows; for today, what remains of it) holds the task's estimate (30 min without an estimate). A click plans it there (one plan row, one "Undo"). No button when no day has room.

### Multiple selection

Ctrl, Cmd or Shift + click choose several cards (Days layout only): a bar at the bottom says "Selected: N" with Today, Tomorrow, Next week, This month and ✕. Dragging a chosen card moves the whole group; `T`, Shift+T, Shift+arrows, Shift+W and Shift+M act on the whole selection, with one write per day touched and a single "Undo". Esc or ✕ clears.

### Plan my week (AI)

When an agent is listening, a "Planned by AI" tab appears next to Days and Horizons as soon as a week proposal is ready: "AI proposal" banner, purple cards for what it moves and dotted lines for where the task is now, a card-by-card decision, then "Apply (N)". Nothing is written before. See [AI and Proposals](AI-and-Proposals).

### Plan shortcuts

Visible in the `?` help, group "On the Plan page":

| Key | Action |
|---|---|
| `N` | Add to the inbox |
| Arrows or `H` `J` `K` `L` | Move from one card or day to another |
| Shift+← / Shift+→ | Move the card (or the selection) by one day |
| `T` / Shift+T | Plan it today / tomorrow |
| Shift+W / Shift+M | Send it to next week / this month |
| `M` | Pick it up to move it with the arrows (Enter drops it, Esc cancels) |
| Ctrl, Cmd or Shift + click | Select several cards |
| Esc | Clear the selection |

## On Android

- **Today**: the title of the Tasks tab is the open list (« Aujourd'hui ▾ » (Today ▾)) and opens the list selector. The page is a **compact timeline**: « À caser » (To place; without a time, with « prévue 10:30 » (scheduled 10:30) for those whose time has passed), then « Ma journée » (My day; all-day first, past dimmed before the "now" line, next thing in bold with « dans X » (in X), « en même temps » (at the same time) in amber, a free slot of 30 minutes or more with « Caser les N ici » (Place N here)). Tomorrow and Suggested are folded under the day. « N à faire » (N to do) or « N faites sur M » (N done of M) under the date.
- **Drag**: long press then drag on a task (overdue ones included): an accent line and a label (« 18:30 » or « À caser ») say where it lands, to the quarter hour, never before now. Released without moving, it opens its menu. « Monter » (Move up) and « Descendre » (Move down) are in the menu.
- **Overdue**: a « N tâches échues » (N overdue tasks) banner with **« Replanifier »** (Replan) opens the full sheet (Today, Tomorrow, Done, « Plus… » (More…): next five days with their load, This week, Next week, This month, Later, Pick a date, Drop; « Tout à demain » (All to tomorrow) and « Étaler sur 7 jours » (Spread over 7 days) at the top; for a series, « Passer cette fois » (Skip this time)).
- **Plan** (list selector, formerly « À venir » (Coming up)): the same board in one column: Inbox (« Tâches à classer » (Tasks to sort) then ideas; « Ajouter » (Add) creates a task), « Échues » (Overdue; « Tout à aujourd'hui » (All to today)), **14 days** with their load or the **four horizons**, a « Plus tard » (Later) strip. A **long press** on a task opens the « Planifier » (Plan) sheet: a day, a horizon (the card leaves its day), « Retirer de ce jour » (Take off this day), or the usual menu. The plans of the 14 days are read after each sync and kept on the phone: the board works offline and each write is queued, with "Undo".
- **Nothing writes the due date** from Plan or « Reporter » (Postpone): a postponement moves the task from today's plan to the chosen day, "Later" sets the `someday` tag and keeps the due date.
- **Reminder of a placed task**: a task placed at a time in the plan rings at that time (see [Notifications and Reminders](Notifications-and-Reminders)).

For phone-side plan details, see [Android](Android).

## Shortcuts

| Key | Action |
|---|---|
| `g` then `t` | Go to Today |
| `g` then `u` | Go to Plan |
| Up/down arrows, Enter, Space, `D`, `P` | On a row (see [Tasks](Tasks)) |
| Right click or Menu key | Row menu |
| Shift or Alt + arrows | Move or resize a selected calendar block |
| Esc | Close the panel |

## Going further

- [Daily plan and calendar](https://github.com/PreciselyWrong/cadence/blob/main/docs/20-daily-plan.md)
- [Today page sections](https://github.com/PreciselyWrong/cadence/blob/main/docs/02-today-page-sections.md)
- [Plan, horizons and overdue tasks](https://github.com/PreciselyWrong/cadence/blob/main/docs/03-upcoming-view.md)
- [Today redesign (design)](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/TODAY-REDESIGN.md)
- [Web UX notes](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/WEB-UX-NOTES.md)
- [Android UX notes](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/ANDROID-UX-NOTES.md)
