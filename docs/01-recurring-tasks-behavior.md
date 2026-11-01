# Recurring Tasks - Behavior Rules

This document explains how recurring tasks work in Cadence from a user behavior perspective. For technical implementation details, see the backend code in `/backend/modules/tasks/recurringTaskService.js`.

---

## **Basic Rules**

1. **A recurring task is a single task that automatically resets itself when completed**
   - You mark it done, and it immediately reappears with a new due date

2. **The task doesn't create copies - it's the same task reusing itself**
   - Same task ID, same title, same details
   - Only the due date changes

3. **Future occurrences are shown in your task list even though they don't exist yet**
   - These are "virtual" - they're previews of what's coming
   - They become real when the previous occurrence is completed

---

## **Completion Behavior**

4. **When you complete a recurring task:**
   - It records that you completed this occurrence
   - It immediately changes to "Not Started" again
   - It gets a new due date based on the pattern

5. **Two ways to calculate the next due date:**
   - **Due-date based** (default): Next occurrence calculated from original due date
     - Example: Task due Monday, you complete it Wednesday → Next is still next Monday
   - **Completion-based**: Next occurrence calculated from when you actually completed it
     - Example: Task due Monday, you complete it Wednesday → Next is 7 days from Wednesday

**Time of day:** a recurring task with a due time (`due_has_time`) keeps its local wall-clock time. After a daylight-saving switch, 09:00 stays 09:00 in your timezone (the UTC instant changes by one hour). The calendar date is advanced in your timezone and the instant is rebuilt from the original local time, for daily, weekly and monthly patterns alike. In the Calendar, every occurrence of a timed task is drawn at that time with the task's estimate as its length (an hour without an estimate).

**Reminders follow the due date:** when a recurring task moves to its next due date (done, skipped or moved), its reminder moves by the same distance and rings again for the new occurrence ([Notifications](36-notifications.md)).

**Skipping an occurrence:** "Skip this occurrence" in the task's ... menu (or `POST /api/task/:uid/skip-occurrence`, or the `skip_task_occurrence` MCP tool) moves the task to its next due date without completing it. The occurrence is recorded with `skipped = true`, so it does not count in completion stats, the Today page or the daily plan. Skipping is refused for completed tasks and when the recurrence has no further occurrence.

---

## **Pattern Rules**

6. **Daily recurring:**
   - Every N days from the due date (or completion date)

7. **Weekly recurring:**
   - Every N weeks on specific day(s)
   - Can repeat on multiple days (e.g., every Mon+Wed+Fri)

8. **Monthly recurring:**
   - **Fixed day**: Every N months on day 15
   - **Weekday pattern**: Every N months on "2nd Thursday"
   - **Last day**: Every N months on the last day of the month

9. **Recurring tasks can have an end date:**
   - After that date, the task stops recurring
   - Without an end date, they repeat forever

---

## **Editing Rules**

10. **If you edit the recurrence pattern of a parent task:**
    - Future occurrences update to match the new pattern
    - Past completed occurrences stay in the history unchanged
    - Changing the pattern never asks which occurrences it reaches: it is the series

11. **Any other edit of a repeating task asks once, when it is saved:** "Edit this task or the series?"
    - **Only this occurrence:** that day becomes a separate one-off task carrying the change (same name, note, project, tags, estimate, time of day and reminder otherwise). The series skips that day; if it was the current occurrence, the series moves on to its next one.
    - **This and following:** the series stops the day before. A new series starts on that day with the same pattern and the change.
    - **All occurrences:** the series itself changes.
    - On the first (current) occurrence, "This and following" is the same as "All".
    - The prompt comes once per save (a blur, a choice in a menu, a drag), never per keystroke. It covers the name, note, time of day, estimate, priority, project, area, goal, tags, reminder, start and defer dates, assignee and status. Completing or reopening keeps its own rules (below); pinning, the Today plan, the order and board columns never ask.
    - Cancelling the prompt saves nothing.

12. **If you edit a future occurrence (a virtual instance):**
    - The prompt applies to that occurrence's own day: "Only this occurrence" splits off that day, not the current one
    - Opening a later occurrence from the Calendar opens it on its own day

---

## **Moving an occurrence**

Moving is an edit of the due date: drag a repeating task to another day (or change its date or time anywhere) and choose how far the change reaches:

- **This occurrence only:** that one day becomes a separate one-off task on the new date. The series keeps its other days, and the moved day is skipped in the series.
- **This and following:** the series stops before that day. A new series starts on the new date and keeps the same pattern, shifted to the new weekday or day of the month.
- **All occurrences:** the whole series moves by the same number of days, and its pattern follows.

Changing only the time of day, or resizing its block in the Calendar (the estimate, or the due time of a start-to-due block), asks the same question. Skipped days stay skipped when the series advances, so completing a task never brings a moved day back.

A split-off task or series keeps the reminder of the series at the same local time and the same number of days before its due date, across a daylight-saving switch too, and rings again. Moving the whole series moves its reminder by the same number of days.

## **Deleting an occurrence**

Deleting a repeating task asks "Delete this task or the series?" (this prompt replaces the usual confirmation):

- **Only this occurrence:** the current occurrence is skipped (recorded as skipped, as "Skip this occurrence" does); a later one is left out of the series.
- **This and following:** the series ends the day before. From the first occurrence, this deletes the series.
- **All occurrences:** the series is deleted (rule 17).

## **Display Rules**

13. **Recurring tasks show up multiple times in your lists:**
    - Today's occurrence (if due today)
    - Future occurrences (as previews)
    - Typically shows next 6-7 occurrences
    - On the Calendar page, every occurrence up to the end of the shown month (plus a week) appears; only the current one can be dragged

14. **Each occurrence looks like a separate task in the UI:**
    - But it's really the same task showing at different dates

15. **You can see completion history:**
    - Records of when you completed past occurrences
    - Shows your pattern of completing the task

---

## **Special Cases**

16. **If a recurring task is overdue:**
    - It stays at its missed due date until you complete it
    - It shows once as overdue on Today and in your task lists
    - It doesn't pile up multiple occurrences
    - Upcoming only shows future occurrences

17. **If you delete a recurring task (all occurrences):**
    - The parent template is deleted
    - All future occurrences disappear
    - Past completion history is preserved

18. **Recurring tasks can belong to projects:**
    - Every occurrence inherits the project
    - Changing the project asks which occurrences it reaches (rule 11)

---

## **Key Concepts**

### Virtual Instances
Future occurrences that are generated on-the-fly for display purposes. They don't exist in the database as separate tasks - they're computed from the parent task's recurrence pattern.

### Parent Task
The original recurring task that acts as a template. It has `recurring_parent_id = null` and stores the recurrence pattern configuration.

### In-Place Advancement
When you complete a recurring task, the same task record is reused with an updated due date, rather than creating a new task instance.

### Completion History
All past completions are tracked in a separate table (`recurring_completions`) to preserve your completion record even though the task itself advances. Skipped occurrences are stored there too, with `skipped = true`.

---

## **Analogy**

Think of it like a gym membership that auto-renews - it's one subscription that keeps coming back on a schedule, not multiple separate subscriptions.

---

## **API and offline clients**

### Online endpoints

All take the series' uid, session or API token auth, under `/api` and `/api/v1`. `occurrence_date` is the occurrence's local day (`YYYY-MM-DD`, user timezone): the series' current due day or one of its later occurrences, otherwise `400`.

- `POST /api/task/:uid/edit-occurrence` with `{ occurrence_date, scope: "this" | "following" | "all", changes }`. `changes` is a `PATCH /api/task/:uid` body (`name`, `note`, `priority`, `due_date` + `due_time` (`HH:mm`), `estimated_minutes`, `project_uid`, `area_uid`, `goal_id`, `tags` (`[{name}]`), `reminder_at`, `start_date`, `defer_until`, `assigned_to`, `status`, ...), validated and logged by the same rules. A `due_date` on another day first moves the occurrence there (as `move-occurrence`). A `reminder_at` is the reminder of the edited occurrence; with "all" it is moved onto the series' current occurrence by the same number of days. Recurrence fields are refused with "this". Answer: `{ task: <series>, edited: <task holding the edited occurrence> }`; `edited.uid` differs from the series for "this" and for "following" past the first occurrence. A refused change (`400`/`403`) leaves the series as it was.
- `POST /api/task/:uid/move-occurrence` with `{ occurrence_date, due_date, scope }`: the date-only case, unchanged (`{ task, moved }`).
- `POST /api/task/:uid/delete-occurrence` with `{ occurrence_date, scope }`. Answer `{ task: <series>, deleted: false }`, or `{ task: null, deleted: true }` when the series was deleted ("all", "following" from the first occurrence, "this" on the last remaining occurrence).

The review log: a moved day is logged on the series as `due_date_changed` (`action: move_occurrence`, `scope`), field changes on the task that received them, as any PATCH.

### What `/api/v1/sync` shows

Both writes are ordinary task rows, journaled like any web edit:

- **"this":** a new `task` upsert (new uid, `recurrence_type: "none"`, `due_date` on the occurrence's day at the series' time of day, the series' fields and `tag_uids`, the changes) and an upsert of the series with `recurrence_exdates` gaining that day, or, for the current occurrence, `due_date` (and `reminder_at`, `reminder_sent_at: null`) moved to its next occurrence.
- **"following":** a new `task` upsert carrying the series' recurrence fields, `recurrence_end_date` and the later `recurrence_exdates`, `due_date` on the occurrence's day, the changes; and an upsert of the old series with `recurrence_end_date` = start of the occurrence's local day minus 1 ms and only the earlier `recurrence_exdates`.
- **"all":** an upsert of the series.

### Offline: the same result with sync ops

A device can apply all three scopes offline with ordinary ops (`T` = series row, `D` = occurrence's local day, `tz` = user timezone). Copy into a new row: `name`, `note`, `priority`, `project_uid`, `area_uid`, `goal_uid`, `estimated_minutes`, `due_has_time`, `tag_uids`; a reminder as `T.reminder_at` plus the whole local days from `T`'s due day to `D` (same wall-clock time). Then apply the user's change to the row that holds the occurrence.

| Edit | Ops, in this order |
|---|---|
| "this" on a later `D` | `upsert` new uid: copied fields + `recurrence_type: "none"`, `status` not started, `due_date` = `D` at `T`'s local time (whole-day: the device's usual whole-day instant on `D`), changes. `upsert T`: `recurrence_exdates` = sorted, unique (`T.recurrence_exdates` + `D`). |
| "this" on the current `D` | Same new row. `upsert T`: `due_date` = next occurrence after `D` that is not in `recurrence_exdates`, `reminder_at` moved by the same duration; no next occurrence: `status` done, `completed_at` now. |
| "following" on a later `D` | `upsert` new uid: copied fields + `recurrence_type`, `recurrence_interval`, `recurrence_weekday(s)`, `recurrence_month_day`, `recurrence_week_of_month`, `completion_based`, `recurrence_end_date` of `T`, `recurrence_exdates` of `T` after `D`, `due_date` = `D` at `T`'s local time, changes. `upsert T`: `recurrence_end_date` = start of `D` in `tz` minus 1 ms, `recurrence_exdates` = those before `D`. |
| "following" on the current `D`, or "all" | `upsert T` with the changes (a reminder given for `D` moves back to `T`'s due day by whole local days). |

| Delete | Ops |
|---|---|
| "this" on the current `D` | `skip_occurrence` with `occurrence_date` = `T.due_date`. |
| "this" on a later `D` | `upsert T`: `recurrence_exdates` + `D`. |
| "following" on a later `D` | `upsert T`: `recurrence_end_date` and `recurrence_exdates` as for an edit. |
| "following" on the current `D`, or "all" | `delete T`. |

Limits of the offline path: `recurrence_exdates` merges as one field, so two devices that each leave a different day out while offline keep only the later list; a device that is online should prefer the endpoints above, which read the series as it is on the server. A date move together with "this" or "following" also shifts the pattern (weekday, day of month) as `move-occurrence` does; offline, a device may instead call `move-occurrence` once it is back online.

---

## **Related Documentation**

- [Architecture Overview](architecture.md) - Technical architecture
- [Backend Patterns](backend-patterns.md) - Module structure
- [Database & Migrations](database.md) - Data model details
- [Common Tasks](common-tasks.md) - How to work with recurring tasks in code

**Technical Implementation Files:**
- Recurrence calculation: `/backend/modules/tasks/recurringTaskService.js`
- Completion handling: `/backend/modules/tasks/routes.js`
- Editing, moving and deleting one occurrence: `/backend/modules/tasks/operations/moveOccurrence.js`
- Task model: `/backend/models/task.js`
- Completion tracking: `/backend/models/recurringCompletion.js`

---

**Document Version:** 1.0.0
**Last Updated:** 2026-11-01
**Audience:** Developers, AI assistants, and end users