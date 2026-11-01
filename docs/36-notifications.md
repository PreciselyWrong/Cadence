# Notifications (fork)

One voice, no guilt, set and forget. Cadence tells you when something is **due soon**, when a **reminder** you set rings, when a **deferred task becomes active**, and when someone assigns you a task or comments. It never announces that something is overdue.

**Related:** [Recurring tasks](01-recurring-tasks-behavior.md), [Webhooks](27-webhooks.md), [Offline sync](30-offline-sync.md), [Desktop client](fork/DESKTOP.md)

Code: `backend/models/notification.js` (create and deliver), `backend/utils/notificationPreferences.js` (who gets what), `backend/utils/quietHours.js`, `backend/modules/tasks/{dueTaskService,deferredTaskService,taskReminderService}.js`, `backend/modules/habits/cadence/reminderService.js`, `backend/modules/projects/dueProjectService.js`, `desktop/src-tauri/src/sync.rs`. Settings: Profile, Notifications.

## What triggers a notification

| Type (preference key) | When | Sent |
| --- | --- | --- |
| Due tasks / projects (`dueTasks`, `dueProjects`) | A task or project becomes due within 24 hours | **Once per due date.** While unread it is refreshed in place (same notification, same `uid` and `created_at`); if the due date moves, the unread one is updated, never destroyed and recreated. Read or dismissed ones are left alone. |
| Task reminders (`taskReminders`) | `reminder_at` is reached | Once per `reminder_at`. A recurring task shifts `reminder_at` with its due date, see below. |
| Habit reminders (`habitReminders`) | A `habit_reminder` time is reached in the user's timezone | Once per reminder per local day, see [Habit reminders](#habit-reminders). |
| Defer until (`deferUntil`) | A deferred task becomes active | Once per task per `defer_until`, and only if that date passed within the last day. |
| Task assigned, comments and mentions | Someone else acts | Immediately. |

**Overdue is not announced.** The server no longer creates `task_overdue` or `project_overdue` notifications and sends no overdue Telegram message. The `overdueTasks` and `overdueProjects` preference keys stay in the stored preferences (nothing is renamed or migrated) but the Notifications tab hides them. Overdue notifications created before the change stay readable; the `task.overdue` and `project.overdue` webhook events are no longer produced. The daily-summary webhook and Telegram digests say **Still open** with the date the work was due, never "overdue".

## Channels and who rings

Each type has its own switches: **In-app, Push, Telegram, Apprise, Desktop**. Email is not offered (no job sends it).

- The notification row is always the record; the external channels do not depend on **In-app**. A task reminder with In-app off and Push on still rings the phone: the row is stored already read, so no badge appears.
- Server-side the chosen channels are written to the notification `sources` (`push`, `apprise`, `telegram`, `desktop`).
- **The phone owns task reminders.** Android sets the alarm itself and rings every task reminder, whatever the server did: it never reads `reminder_sent_at`, and it keeps only its own record of what it rang (per device, keyed by task uid and `reminder_at`), so an inexact alarm that fires late still rings. Two phones on one account each ring. `taskReminders.desktop` is **off by default**. Turn it on for a row only if you want the computer to ring too.
- `tasks.reminder_sent_at` is the server job's bookkeeping: the `task_reminders` job stamps it when it has handled a `reminder_at` (before sending, so a failing channel is not retried every minute), whether or not any channel was on. It does not mean anyone was notified.
- **The phone owns habit reminders too.** `habitReminders` is in-app only by default: Push, Telegram, Apprise and Desktop are off, so the phone is the one voice. Turn a channel on only if you want the server to ring there too.
- **Desktop is on by default** for due soon (tasks and projects) and for deferred-now-active, off for everything else. A stored explicit choice always wins.
- The desktop client (`desktop/`) shows a notification only when its `sources` contain `desktop`, once per notification `uid` (the last 500 uids are remembered on disk), and not before `deliver_after`.
- Telegram receives due-soon items as one batch per run; push and Apprise send per notification. A channel is not repeated for the same notification within 24 hours.

## Habit reminders

The `habit_reminders` job (every minute, `backend/modules/habits/cadence/reminderService.js`, one process at a time through `withJobLock`, off in tests and with `DISABLE_SCHEDULER=true`) reads the synced `habit_reminder` rows and creates a notification (`type: reminder`, `data.reason: habit_reminder`, message `Rappel : <habit>`, never a word about being late) when all of this holds, in the user's profile timezone:

- the reminder is enabled and its habit is active and not archived;
- the local time of the reminder was reached within the last 10 minutes (a server that was down longer misses it rather than ringing a morning reminder in the evening);
- its weekday matches `days_of_week` (empty means every day);
- the habit is not paused that day, and the JS rule engine says the habit is due: a **conditional** reminder (the default) rings only while the period still needs attention, so not once the goal is met; a non-conditional one rings on the days the habit is planned. This is the rule the phone applies to its own alarms.

Once per reminder per local day: the notification carries `data.reminderUid` and `data.date`, and a reminder that already has one for that date is skipped. The row is stored unread when In-app is on; with In-app off and no external channel nothing is created, and with only an external channel the row is stored already read. Chosen channels go to `sources`, and quiet hours hold them through `deliver_after` like any other notification. The webhook event is `habit.reminder`.

Preference key for settings screens: `habitReminders` (`inApp: true`, `push`, `telegram`, `apprise`, `desktop`: `false` by default).

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

`reminder_at` and `reminder_sent_at` reach clients through the normal task sync. `reminder_sent_at` is a server-only field (`serverFields` in `backend/modules/sync/registry.js`): a device cannot push it, and the sync module clears it when a push changes `reminder_at`, so the server job handles the new time. Clients must not use it to silence their own alarms. `quiet_hours` is read through `GET /api/profile` and is not an entity of `/api/v1/sync`.

## Android: everything with a time can ring

The phone rings, one voice, calmly. Quiet hours (`users.quiet_hours`, read through the profile) hold every alarm below until the window ends, exactly as for task reminders. Settings: **Réglages › Notifications** (timed tasks, calendar events with a switch per calendar, habits, quiet hours read-only) and, per calendar, **Réglages › Agendas** and the Agenda options sheet (chip **Notifications**, on by default).

- **Timed tasks.** A task with a due **time** and no `reminder_at` rings at that time. Setting **Rappeler les tâches à heure fixe** (on by default) with a lead: at the time, 5, 10, 15 or 30 minutes before (default: at the time). An explicit `reminder_at` wins and replaces it. A recurring timed task rings for **each occurrence** inside the 14-day alarm horizon. Never for **Plus tard** (`someday`) tasks, done or cancelled ones, or an occurrence before the task's defer date. A timed alarm missed while the phone was off rings only within the next 15 minutes; an explicit reminder still catches up for 24 hours. The notification keeps **Terminer** (only for the stored occurrence, not a future one) and **Plus tard**.
- **Device calendar events.** Setting **Rappeler les événements** (on by default, lead 10 minutes before; same choices as above). Each calendar has its own **Notifications** switch (on by default); a calendar that is hidden everywhere never rings, an event copied on several calendars rings once (same rule as the lists), and a hidden or done occurrence stays silent. All-day events do not ring; the optional **Résumé des journées entières à 8 h** (off by default) posts one notification each morning listing them. The event is read again when the alarm fires: moved, deleted, hidden or done events stay silent. Actions: **Ouvrir l'agenda** and **Fait** (marks the occurrence done in Cadence only, like the checkbox; absent when "Cocher un événement" is off). Two snooze actions follow: **À la fin** re-rings at the event's end (absent when the event ends in under 5 minutes, and for all-day events), **10 min** re-rings 10 minutes later; both respect quiet hours, and the re-rung notification reads the event again (silent if it is done, hidden, moved or deleted).
- **Habits.** A habit with a reminder time already has an enabled reminder (default). Nothing else changed; habit alarms keep their 15-minute inexact window.
- **When alarms are set again.** At app start, after a sync, when the calendar provider changes (a `ContentObserver` on `CalendarContract` while the app process lives), every 6 hours by a refresh alarm that wakes the process, and after a reboot, an app update, a time or time zone change, or a change of the exact-alarm permission.
- **Exact or windowed.** Task and event alarms are exact when Android allows it (permission **Alarmes et rappels** granted by the user, **Réglages › Notifications › Heure exacte**; always on Android 11 and earlier); otherwise a window of one minute either side. The app never asks for it at install.

Notifications use the "Rappels de tâches" and "Événements d'agenda" channels, and never speak of lateness.

