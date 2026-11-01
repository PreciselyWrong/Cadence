# Notifications (fork)

One voice, no guilt, set and forget. Cadence tells you when something is **due soon**, when a **reminder** you set rings, when a **deferred task becomes active**, and when someone assigns you a task or comments. It never announces that something is overdue.

**Related:** [Recurring tasks](01-recurring-tasks-behavior.md), [Webhooks](27-webhooks.md), [Offline sync](30-offline-sync.md), [Desktop client](fork/DESKTOP.md)

Code: `backend/models/notification.js` (create and deliver), `backend/utils/notificationPreferences.js` (who gets what), `backend/utils/quietHours.js`, `backend/modules/tasks/{dueTaskService,deferredTaskService,taskReminderService}.js`, `backend/modules/projects/dueProjectService.js`, `desktop/src-tauri/src/sync.rs`. Settings: Profile, Notifications.

## What triggers a notification

| Type (preference key) | When | Sent |
| --- | --- | --- |
| Due tasks / projects (`dueTasks`, `dueProjects`) | A task or project becomes due within 24 hours | **Once per due date.** While unread it is refreshed in place (same notification, same `uid` and `created_at`); if the due date moves, the unread one is updated, never destroyed and recreated. Read or dismissed ones are left alone. |
| Task reminders (`taskReminders`) | `reminder_at` is reached | Once per `reminder_at`. A recurring task shifts `reminder_at` with its due date, see below. |
| Defer until (`deferUntil`) | A deferred task becomes active | Once per task per `defer_until`, and only if that date passed within the last day. |
| Task assigned, comments and mentions | Someone else acts | Immediately. |

**Overdue is not announced.** The server no longer creates `task_overdue` or `project_overdue` notifications and sends no overdue Telegram message. The `overdueTasks` and `overdueProjects` preference keys stay in the stored preferences (nothing is renamed or migrated) but the Notifications tab hides them. Overdue notifications created before the change stay readable; the `task.overdue` and `project.overdue` webhook events are no longer produced. The daily-summary webhook and Telegram digests say **Still open** with the date the work was due, never "overdue".

## Channels and who rings

Each type has its own switches: **In-app, Push, Telegram, Apprise, Desktop**. Email is not offered (no job sends it).

- The notification row is always the record; the external channels do not depend on **In-app**. A task reminder with In-app off and Push on still rings the phone: the row is stored already read, so no badge appears.
- Server-side the chosen channels are written to the notification `sources` (`push`, `apprise`, `telegram`, `desktop`).
- **The phone owns task reminders.** Android sets the alarm itself; `taskReminders.desktop` is **off by default**. Turn it on for a row only if you want the computer to ring too.
- **Desktop is on by default** for due soon (tasks and projects) and for deferred-now-active, off for everything else. A stored explicit choice always wins.
- The desktop client (`desktop/`) shows a notification only when its `sources` contain `desktop`, once per notification `uid` (the last 500 uids are remembered on disk), and not before `deliver_after`.
- Telegram receives due-soon items as one batch per run; push and Apprise send per notification. A channel is not repeated for the same notification within 24 hours.

## Quiet hours

`users.quiet_hours` is `{ "enabled": true, "start": "22:00", "end": "07:00" }`, read in the user's profile timezone, and may cross midnight. It is a plain profile field (`GET` and `PATCH /api/profile`, `null` clears it, anything but `HH:mm` is a 400), so the Android app can read it.

- `Notification.createNotification` always stores the in-app row immediately.
- When it holds any delivery channel and the moment falls inside the window, push, Telegram, Apprise and desktop delivery are **held**: the row gets `deliver_after` = end of the window.
- A scheduler job (`held_notifications`, every minute) sends the held ones once `deliver_after` has passed and clears the field. The desktop client reads `deliver_after` the same way and waits.
- Webhooks are not held. Reminders held overnight arrive together at the end of the window.

## Recurring tasks

When a recurring task moves to its next due date (completion, skip, move, Google sync, MCP), `reminder_at` moves by the same distance and `reminder_sent_at` is cleared so the reminder rings again.

## Setting a reminder

Web: in the task panel, **More** reveals a **Reminder** chip (shown directly once a reminder is set); the full task page has a **Reminder** card. Both send `reminder_at` (ISO instant) through `PATCH /api/task/:uid`; clearing it sends `null`. A new `reminder_at` re-arms the reminder.

## Sync notes

`reminder_at` and `reminder_sent_at` reach clients through the normal task sync. A device that changes `reminder_at` must reset `reminder_sent_at` on the server (the sync module does not yet; see the repository TODO). `quiet_hours` is read through `GET /api/profile` and is not an entity of `/api/v1/sync`.
