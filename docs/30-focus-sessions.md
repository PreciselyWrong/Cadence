# Focus Sessions

The tomato timer in the top bar (25 minutes) keeps a record of the time you focus.

## What is recorded

- A timer that runs to the end saves a 25-minute session, once, even if the page was closed and reopened while it ran.
- Resetting or closing the timer early saves the time focused so far when it is at least 5 minutes; shorter attempts are dropped.
- Pauses are not counted. The start time is the end time minus the time focused.
- A session can be tied to a task (`task_uid` on the API); the timer itself does not pick one yet.

Sessions live in `focus_sessions` (`user_id`, optional `task_id` set to null when the task is deleted, `started_at`, `ended_at`, `duration_seconds`) and are removed with the account.

## Where they show

- **Calendar:** orange blocks at the time they ran, titled "Focus" or "Focus: task name". View options → *Show focus sessions* (`ui_settings.calendar.showFocus`, on by default).
- **Insights → Productivity → Focus:** total time, sessions, the most focused hour, minutes per day and per hour for the last 7, 30 or 90 days, and the five tasks focused on most, in the user's timezone.

## API

| Method | Path | |
|---|---|---|
| POST | `/api/focus-sessions` | `{ duration_seconds, ended_at?, started_at?, task_uid? }` → `{ session }`; 1 minute to 12 hours, not in the future |
| GET | `/api/focus-sessions?start=YYYY-MM-DD&end=YYYY-MM-DD` | `{ sessions }` started in those local days (at most 400 days) |
| DELETE | `/api/focus-sessions/:uid` | 204; 404 for another user's session |
| GET | `/api/focus-sessions/stats?days=30` | `{ days, total_minutes, sessions, by_day, by_hour, top_tasks }` |
