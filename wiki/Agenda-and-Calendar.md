# Agenda and Calendar

The calendar shows your tasks at their real duration next to your appointments, in six views. It syncs with Google Calendar and Google Tasks in both directions, reads the iCal calendars you give it, and itself publishes your tasks as a feed or a CalDAV calendar. On Android, the same thing is called the **Agenda** and reads the phone's calendars.

![The calendar in week view](images/web/calendar.png)

## Calendar views (web)

The page header shows "Calendar" with the month as a subtitle, a view selector, the previous, **Today** and next buttons, printing and the options.

| View | What it shows |
|---|---|
| **Year** | The twelve months as small grids; each day is tinted according to the number of items it carries (an all-day bar counts on each day it covers). A click on a day opens it in Day view; the arrows advance by one year |
| **Month** | A month grid; multi-day tasks are bars that keep the same row all week. A day with more than three entries shows two and a **+N** button that lists the others (tasks before habits) |
| **Week** | The seven-day hourly grid, with an "All day" row at the top |
| **N days** | The grid of 2 to 7 days from the current date (3 by default); the arrows advance by N days; without weekends, N counts working days |
| **Day** | The grid of a single day |
| **Agenda** | The month, day by day: each day that has something has its heading, all-day items first. It opens on today (or the next non-empty day); the arrows advance by one month |

**Week numbers** (ISO) and a **mini calendar** beside the views are optional. The print button prints only the displayed view, without the sidebar or toolbar.

### On a phone and small screens

Under 640 px, the view selector shrinks to four segments (Month, Week, Day, Agenda) with "More views" for Year and N days. The Month view shows one coloured dot per event (three at most); touching a day lists its events under the grid.

## How tasks are drawn

A task does not have a single size: it takes its real length.

| Situation | Drawing |
|---|---|
| Due date with a time, start earlier the same day | A block from the start to the due date; pulling its bottom edge changes the due time |
| Due date with a time, no start | A block that begins at the due time and lasts the task's estimate (one hour without an estimate); pulling the edge sets the estimate in 15-minute steps, from 5 minutes to 12 hours |
| Due date on the whole day | A bar in the "All day" row, from the start (if earlier) to the due date. In Month, it appears on each day covered |
| Timed due date with a start on an earlier day | A bar too |
| Defer Until | A one-hour block at that time |
| Recurring task | The task at its current date, then its following occurrences (to the end of the loaded period: the month plus one week on each side) in lighter blue |
| Completed task | In green, as long as "Show completed" is on |

Upcoming occurrences of a series **cannot be moved**: move the current occurrence and the rest follows. When you move or resize the current occurrence, the "this occurrence or the series?" question appears (see [Tasks](Tasks)).

### Drag and drop

- Moving a block keeps its duration: for a start-to-due block, both ends move; a bar moves its start and its due date by the same number of days, keeping their times.
- Dropping on an hour of the Week or Day view sets the time where the top of the block lands, **in 15-minute steps**. Dropping in Month or in the "All day" row keeps the time.
- Clicking a task opens it in the panel, on its own day for a later occurrence.

### The "Arrange tasks" panel

The **"Arrange tasks"** button opens a side panel with two tabs: **"No date"** (open tasks with no due date) and **"Overdue"** (open, due before today). Completed and cancelled tasks, subtasks, habits and recurrence previews are excluded. Tasks are grouped by project in collapsible sections, filterable by project, tag and priority. Drag one onto the calendar: on a day of the Month (or in the "All day" row), it takes that due date; on an hour of the Week or Day view, it takes that due date **and** that time.

### An empty cell creates a task

Clicking an empty hour (Week, N days and Day views) offers **"Add task at 14:00"**: a task due that day at that time (without a start). When a Google calendar is editable, the same menu also offers **"New Google event"**.

## View options

The "View options" button (sliders) sets the following, saved in your profile, so identical from one browser to another:

| Option | Effect (default value) |
|---|---|
| Show completed | Done tasks stay in green (on) |
| Show weekends | Off: Month and Week no longer have Saturday or Sunday and Day skips them (on) |
| Show all repeats | Off: each recurring task stays at its current date (on) |
| Show habits | The due days of habits, one item per habit and day (on), see below |
| Days in multi-day view | From 2 to 7 (3) |
| Show week numbers | ISO numbers on each row of Month and in the corner of Week (off) |
| Show mini calendar | A small month beside the views, on a wide screen (off) |
| Show focus sessions | Completed sessions as orange blocks at the time they took place (on) |
| Holidays | Country and region ("Whole country"): holidays are red items on the day; they do not count in the Year view |
| Visible hours | From 0 h to 24 h by default; narrowing the window hides the night |
| Colour by | Default, Project, Priority (red, amber, blue) or Tag; a task with no project or tag is grey; a done task stays green |

### Habits on the calendar

One item per habit and per due day: an "all day" pill in the habit's colour, or a 30-minute block at the time of that day's **first active reminder**. A successful day carries a tick. Pause days are omitted. A "3 times a week" habit or free tracking only appears on the days when it was done, since it is not due on a given day. Clicking opens the habit's page; boxes are ticked from the habit. See [Habits](Habits).

### Visible hours and "earlier / later" bars

When the visible-hours window is narrowed, a dated item outside the window is counted in a bar at the top ("2 earlier") or bottom ("3 later") of the grid, with a dot per column in Week or N days view; hovering lists them. A click on the bar shows the whole day for the session; "Hide early and late hours" restores the window. The hidden zone is striped. The same window applies to Today's calendar (see [Today and Daily Plan](Today-and-Daily-Plan)).

## Events

### What you see of an event

Clicking an event of an iCal calendar or a Google calendar opens a **read-only panel**: title, day and time, calendar name, location, description. The same gesture works in Today, in Plan (merged calendar) and on the Calendar page.

- **Location**: a postal address opens in Google Maps; a web address opens as is. A **Copy address** button copies the location ("Address copied").
- **Join**: a button appears when the location or description contains a video conference link (Meet, Zoom, Teams or Webex).
- **Description**: Google keeps it as HTML; Cadence displays and edits it as plain text (paragraphs, line breaks, list items). An unmodified description is not sent back on save, so its formatting stays in Google.
- **The same event, only once.** An event carried by several feeds or Google calendars (same title, same day, same start, same end) is shown only once; the main Google calendar wins. Android applies the same rule.

### Create, edit, delete (two-way Google calendars)

On a calendar set to "Two-way":

- **Create**: click an empty hour (one-hour event) or a day of Month or of the Week header (all-day event).
- **Edit**: click the event, then **"Edit"**; title, calendar, start, end, location, description. "Open in Google Calendar" leads to its page when it exists.
- **Delete**: the button asks for a second click ("Delete for good?").
- **Move or stretch**: by dragging in the grid. Read-only events stay fixed and say why on hover; a multi-day event stays fixed.
- **Repeating event**: only one occurrence is changed at a time (Google keeps it as an exception). To edit the whole series, go through Google Calendar.

## Sync with Google Calendar and Google Tasks

Sync is **two-way**, for one Google account per user. It is set in Profile › Organization › Calendars (or with the **"Calendars"** button of the Calendar page).

### Connect Google

The server administrator must first have created a Google OAuth client (see [Self-Hosting](Self-Hosting)); without it the section shows "Not set up on this server: the administrator sets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET". Then **"Connect Google"** opens the Google sign-in, and the first sync ("first sync running…") reads the last 90 days and everything upcoming. On Android: Réglages › Agendas › **« Connecter Google »** (Settings › Calendars › Connect Google), which opens the phone's browser then returns to the app; on failure or an expired token, the button becomes **« Reconnecter Google »** (Reconnect Google) with the last error.

### Three settings per calendar

Each calendar has a **mode** in a list next to its name:

| Mode | Effect |
|---|---|
| **Hidden** | Not read, displayed nowhere (neither Calendar, nor Today, nor AI draft); its copies are deleted, reconnecting it reads everything again |
| **Read only** (default) | Displayed but not editable, even if Google would allow it |
| **Two-way** | Editable; offered only if Google lets the account write (owner or editor) |

A display switch next to the mode ("Show *name* on the Calendar page") only sets display. A calendar hidden in Google stays hidden the first time. A calendar that is not displayed is also left out by Today, the plan and the AI draft: its appointments no longer block time.

Two other settings: **"Calendars, and dated tasks in a "Cadence" calendar"** (events switch) and **"All tasks with Google Tasks (one list per project)"** (tasks switch), each can be turned on separately.

### Where each task goes

With both switches, **each task goes to Google only once**:

| Your task | In Google |
|---|---|
| With a due **time** | An event in the "Cadence" calendar (created at the first sync) |
| No date, or with a date without a time | A Google Tasks task |
| No project | In the default Google Tasks list |
| In a project | In a Google Tasks list of the same name (created as needed, including on the project side when it receives its first task) |

If a task gains a time, it leaves Google Tasks to become an event at the next sync, and the reverse. With a single switch, that side takes all the tasks it can hold (events only: any dated task, all day when it has no time; tasks only: all tasks).

The **"Calendar for tasks with a time"** setting lets you choose a calendar other than "Cadence" to receive these events (any where Google allows writing). In a chosen calendar, only events marked by Cadence are tasks: your other events stay ordinary events. Changing this choice moves the tasks' events at the next sync; a chosen calendar that disappears or becomes read-only falls back to "Cadence".

### What Google does to your tasks, and vice versa

- An event moved or resized in Google moves the task (due date, start or estimate); renamed, it renames the task.
- **Deleting the event in Google removes the task's date**: the task stays.
- A completed task leaves the calendar; a task without a date is not in it.
- An event added to the "Cadence" calendar in Google becomes a **new task** (only this calendar does so). An all-day event added there becomes a task without a time and moves into Google Tasks.
- A recurring task only appears through its **next occurrence**. The events created are "free": they do not block your availability in Google.
- Google Tasks syncs the title, the note, the done state, the due **day** (not the time), the parent-subtask link and the list ↔ project. When Google keeps the same day, the time set in Cadence stays.
- **Deleting a task in Cadence** deletes it from Google Tasks. **Deleting it in Google Tasks marks it done in Cadence** (with its completion time; a recurring one stops) rather than deleting it: reopening or editing it sends it back.
- Deleting a whole list in Google does not delete the tasks in Cadence: they are unlinked and go out again in a new list.
- A task completed more than 7 days before the first sync is not sent; a Google task already completed before is not imported.
- **Not** synced: priority, tags, statuses other than open or done (in progress, waiting and planned stay open in Google; archived and cancelled are removed from Google), habits and occurrences of a series.

### When, and in case of conflict

The server syncs every 2 minutes by default (adjustable from 1 to 60 minutes by the administrator), right after connecting or a settings change; **"Sync now"** starts a pass on demand. Changes made from the Calendar page leave immediately. When only one side has changed, it wins. When both have changed since the last pass, **the most recent change wins**, and the log keeps a trace.

### Sync log

Under **"Sync log"** (collapsed, loaded on opening, refreshed after each pass): the last 50 entries, most recent at the top, with the time, the type and a message, linked to the task when there is one.

- **Conflict**: an item changed on both sides; the message says which change was kept.
- **Error**: an item refused by Google (the pass continues), or a whole pass that failed.
- **Info**: a task marked done because its Google task was deleted, an event moved to another calendar.

If **a whole pass** fails (access revoked or expired, Google unreachable), a single red alert appears in the bell, on the phone and on the Linux client, until a pass succeeds; a click opens Profile › Calendars without marking it read. See [Notifications and Reminders](Notifications-and-Reminders).

### Disconnect

**"Disconnect"** revokes access and deletes all the Google copies and links kept in Cadence. Your Cadence tasks stay; what is already in Google stays there too (the "Cadence" calendar and lists included). Turning off a single switch unlinks that side only; turning it back on starts from a new link, which can create duplicates for what stayed in Google in the meantime.

### Limits

One Google account per user; you cannot edit a whole Google series from Cadence; Google Tasks loses the time of day (the "Cadence" calendar keeps it); tasks that someone shares with you in their project are not sent (only tasks you own).

## iCal calendars (read-only)

Profile › Organization › Calendars, or the **"Calendars"** button of the Calendar page, connects **read-only iCal** feeds: the "secret address in iCal format" of Google Calendar, Apple Calendar, Outlook, Fastmail, or a `webcal://` link.

1. **"Connect a calendar"**: a name (Work, Family…), the secret iCal address and a colour.
2. **"Connect"** checks the feed ("Checking the calendar…") and refuses it if it is unreadable.
3. Each calendar is a pill above the Calendar views: a click shows or hides its events ("Show *name* on the Calendar page"), a setting remembered per calendar. A hidden calendar is also left out by Today, the plan and the AI draft.

Cadence **never writes** to these calendars. Their address is a secret: it is encrypted on the server and only the host is sent back to the screen. The server reads the feed through a security gate (public addresses only, each redirect checked, 10 seconds and 5 MB at most), keeps it cached for 15 minutes, and expands repeating events (RRULE, exceptions, moved instances), timezones, all-day events and events that cross midnight into your timezone. A cancelled event is ignored. If a feed stops responding, Today keeps the last cached copy and the error is shown in the Calendars tab ("Could not load: *name*"). For calendars on a private network, the administrator must allow private addresses.

## Publish your tasks to another calendar

Profile › Organization › Calendars › **"Subscribe to your tasks"** creates a secret address `https://cadence.example.com/api/feeds/tasks/tf_….ics` to paste into Google Calendar ("From URL"), Apple Calendar or Outlook.

- **"Make an address"** creates it; it is shown **only once** ("Copy it now"). Only a fingerprint is kept. **"Make a new address"** replaces the old one, which stops working immediately; **"Turn off"** deletes it.
- The feed lists your open tasks with a due date, from 60 days before to 400 days after, excluding done, archived or cancelled tasks, drawn as in the Calendar (hourly block, or all-day event from the start to the due date). Recurring ones only appear at their current date.
- Anyone who has the address can read these tasks: treat it like a password.

## CalDAV

Cadence speaks CalDAV in both directions, by default.

### Use Cadence as a task server

Apps like **tasks.org** (Android), Apple **Reminders** (iOS and macOS), **Thunderbird** and **Evolution** connect directly to Cadence: enter the address `https://cadence.example.com/caldav/`, your email and your password, then choose the task calendar. Thunderbird and Evolution ask for the full address `…/caldav/<utilisateur>/tasks/`. One instance can be read by several apps at once: changes from one arrive in the others.

- With **two-factor authentication**, the account password no longer works in CalDAV: use an **API key** as the password.
- A task deleted in the client is deleted in Cadence at the next sync (in two-way mode).
- The administrator can serve **one calendar per project** (plus "(No Project)"): Reminders then shows one list per project, a project shared with you appearing with its tasks (read-only if the share is).
- The fields: name ↔ title, note ↔ description, due date, "Defer Until" ↔ start, end ↔ end date, recurrence ↔ repeat rule, subtasks ↔ parent link, inverted priority (high 3, medium 5, low 7). The seven statuses fold into four (not started, waiting and planned give "to do"). Projects, tags and habit mode travel in their own fields that clients do not display.
- Limits: clients see individual occurrences (365 upcoming); editing an occurrence creates an exception; deleting the parent task deletes all occurrences.

### Sync with a remote CalDAV server

Profile › Integrations › CalDAV Sync: **"Add Calendar"** (name, description, colour, server address, calendar path, basic authentication or access token) links Cadence to Nextcloud, Baikal, iCloud or Radicale.

| Setting | Choices |
|---|---|
| **Direction** | Bidirectional (default), "Pull only" (import), "Push only" (export) |
| **Interval** | 5, 15 (default), 30, 60 minutes or manual |
| **Conflicts** | Last modified wins (default), Local always wins, Remote always wins, or manual resolution ("Conflicts" lists both versions side by side) |

**"Sync now"** forces a pass; "Last sync" and the number of conflicts are shown per calendar. Remote passwords are encrypted. By default, a remote calendar must be on HTTPS at a public address; a NAS or a Nextcloud on the local network requires the administrator to allow private addresses.

## On Android: the Agenda

The **Agenda** tab shows the events of the phone's calendars, your tasks and your habits. It reads the device calendar (the "See your calendars" permission) and never writes to it.

- **Four modes**: **Jour** (Day), **3 jours** (3 days), **Mois** (Month) and **Liste** (List; the coming days). The header is on one line: the period (« Samedi 31 octobre · S44 », Saturday 31 October · W44) serves as the title, beside previous, « Aujourd'hui » (Today) and next. **Swiping horizontally** changes the period in all modes.
- **Three markers**: a circle in the calendar's colour for an event, a square checkbox for a task (it ticks), a hexagon for a habit (filled once done, touched it opens its entry). Touching a task's body opens its panel.
- **Display** (button; « Affichage »): Tâches avec heure (Tasks with a time; on the grid at their time, otherwise in the day's row), Habitudes (Habits), Tâches terminées (Completed tasks), Week-ends (Weekends), Numéros de semaine (Week numbers). Below, the **list of calendars** shared with Réglages › Agendas (Settings › Calendars), which links to all settings.
- **Add a task**: touching an empty slot of the grid (Day, 3 days) opens quick add with the date and time prefilled (the touched half hour, rounded down). « Ajouter une tâche ce jour » (Add a task this day) also exists.
- **Tasks to plan**: a « À planifier · glisser dans la journée » (To plan, drag into the day) drawer: drag a task into the grid, it takes the date and time dropped (« Déposer à 15:00 », Drop at 15:00), with "Undo". Pulling a block's edge sets its duration.
- **Device events**: touching one opens its panel (title, time, calendar, location with **« Ouvrir dans Maps »** (Open in Maps) and **« Copier l'adresse »** (Copy address), « Rejoindre » (Join) for a video call, **« Ouvrir dans l'agenda »** (Open in the calendar) for the full event in the system app). **« Masquer ici »** (Hide here) hides an event in Cadence only: nothing is written at the provider, an « Événement masqué ici » (Event hidden here) message offers to undo, and they are restored in Réglages › Agendas. The hidden event also disappears from Tasks and from the widget.
- **Réglages › Agendas** (Settings › Calendars): for each calendar, « Utiliser dans Cadence » (Use in Cadence; by default: those synced on the device), then chips **Agenda**, **Liste Tâches** (Tasks list), **Notifications** and **Cocher une fois passé** (Tick once past); calendars are grouped by account and those not used are shown nowhere. **« Cocher une fois passé »** shows a finished event as done, without writing anything; the list updates every minute.
- An event carried by two calendars (same title, same start and same end, different calendars) is shown only once, on the account's main calendar.
- **Google**: "Connecter Google" (Connect Google) in Réglages › Agendas (see above).
- Cadence tasks that have a time ring as described in [Notifications and Reminders](Notifications-and-Reminders).

See also [Android](Android).

## Special cases

| Situation | What happens |
|---|---|
| An iCal feed stops responding | Last cached copy, error in the Calendars tab |
| You hide a Google calendar | It disappears from Calendar, Today, the plan and the AI draft |
| You delete a "Cadence" event in Google | The task loses its date and stays |
| You delete a Google task | The Cadence task goes to "Done" |
| The time changes (summer, winter) | A recurring task with a time keeps its local time |
| Offline | The web calendar is readable from the cache; your changes wait for reconnection (see [Offline and Sync](Offline-and-Sync)) |

## Shortcuts

| Key | Action |
|---|---|
| `g` then `c` | Go to Calendar |
| `Ctrl+K` | Command palette: "Go to Calendar" |

## Going further

- [Daily plan and calendar](https://github.com/PreciselyWrong/cadence/blob/main/docs/20-daily-plan.md)
- [Google sync](https://github.com/PreciselyWrong/cadence/blob/main/docs/33-google-sync.md)
- [CalDAV sync](https://github.com/PreciselyWrong/cadence/blob/main/docs/11-caldav-sync.md)
- [Recurring tasks](https://github.com/PreciselyWrong/cadence/blob/main/docs/01-recurring-tasks-behavior.md)
- [Web UX notes](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/WEB-UX-NOTES.md)
- [Android redesign](https://github.com/PreciselyWrong/cadence/blob/main/android/docs/REDESIGN.md)
