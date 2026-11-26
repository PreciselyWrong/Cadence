# Android

The Cadence Android app is the server's pocket companion: one-gesture capture, your day at a glance, widgets, reminders, the phone's calendar and habits, all usable without a network and then synced with your server. The PC is mostly for planning the week; the phone is for living the day.

The Android app is available in French only. This page quotes its labels in French, with the English meaning in parentheses the first time each one appears.

## Install and connect

**Requirements**: Android 8.0 or newer. The app is an APK package installed "by hand" (outside any store): allow installation from the source that gave it to you (browser, file manager, private catalog), then open it. To build it yourself: `android/dev.sh` (Linux) or `android/dev.ps1` (Windows) builds the debug package, installs it on the first device detected by ADB and opens it (JDK 21 and the Android SDK required; `--dummy` loads demo data).

**Connect to your server**

1. On the web: Profile › **API Keys**, create a key (the name is free, for example "Phone"). The screen can show a **QR code "to connect a device"**.
2. On the phone: Réglages › Données › **Compte Cadence** (Settings › Data › Cadence account) › « Scanner le code QR » (Scan the QR code) (a code that does not come from Cadence is refused: « Ce code QR ne vient pas de Cadence. » (This QR code does not come from Cadence.)), or enter the **server address** (the one you open in the browser) and the key, then « Se connecter » (Sign in).
3. The phone downloads a full copy of your data (see [Offline-and-Sync](Offline-and-Sync)), then stays up to date by itself.

**Signing out** (same screen) erases the synced data from the device: the app says so before doing it. Habits of another account are never sent to the new one: the app offers to keep them on the phone only, or to delete them.

## Navigate

A **translucent floating bar** with five targets: **Inbox · Tâches · Agenda · Habitudes · Bilan** (Inbox, Tasks, Agenda, Habits, Insights). "Tâches" is the opening screen. A gear at the top right of each tab opens the **Réglages** (Settings). Adding is always done with the round "+" button at the bottom right, never with a header button.

Appearance (Réglages › Personnalisation › **Apparence** (Settings › Personalization › Appearance)): System, Light or Dark theme (with « Noir pur en sombre » (Pure black in dark) for OLED screens), accent color among Violet (default), Indigo, Blue, Teal, Green, Amber, Coral, Pink, a free color, or **Material You** (Android 12 and later, taken from the wallpaper).

## Tasks

The **Tâches** tab has no tabs or filter rows: the **title is the list selector** (« Aujourd'hui ▾ » (Today ▾)). Tapping the title opens a sheet with your pinned projects and notes, then Aujourd'hui (Today), Planifier (Plan), Projets (Projects), Étiquettes (Tags), Notes, Terminées (Completed), the **area** filter, and Réglages (Settings). The subtitle recalls the date and the chosen area.

### Aujourd'hui (Today)

- **Échues** (Overdue) at the top (error header, « Voir les n » (See the n)), then the day, then the "Routine" strip of the current habits (up to 5 habits to tap to log).
- Your **calendar events** are mixed in with the tasks, by time.
- **Empty day**: « Journée bouclée » (Day wrapped up) and a link to Demain (Tomorrow). "Demain" and « Suggérées » (Suggested) stay collapsible under the list; a task without a date can be found again.
- **Ma journée** (My day): in the morning, a card offers to **plan** (automatic placement in your free hours, « Tout accepter » (Accept all) or remove a proposal; nothing is saved before you accept). In the evening, a line offers to « Clore la journée » (Close the day) (« Reporter 3 à demain » (Carry 3 over to tomorrow) or « Laisser tel quel » (Leave as is)).
- **Arranging by finger**: a **handle** to the right of tasks without a time can be dragged vertically to order them (the order is that of the daily plan, the same as on the web). A long press then drag moves any task of Today: a line and a label tell where it lands (a time, or « À caser » (To fit in)). An overdue task dragged into the day becomes today's. Events from the phone's calendar cannot be moved.
- **Ma matinée** (My morning): when the AI has prepared the day, a card stays at the top of Today (see below, "The morning ritual").

### Planifier (Plan)

Title menu › **Planifier**. The same page as the web, in one column:

- **Inbox**: « Tâches à classer » (Tasks to sort) then the ideas; « Ajouter » (Add) creates a task (a named date, or a time alone, plans it on that day).
- **Échues** with « **Replanifier ▾** » (Replan): Aujourd'hui (Today), Demain (Tomorrow), **Étaler sur 7 jours** (Spread over 7 days), Choisir une date (Choose a date). These gestures only write the plan, never the due date.
- **14 days** with their load, or the **horizons** (Cette semaine, Semaine prochaine, Ce mois-ci, Mois prochain, Un jour: This week, Next week, This month, Next month, Someday), and a "Plus tard" (Later) strip under the 14 days.
- A **long press** on a task opens « Planifier » (Plan): a day, a horizon, « Retirer de ce jour » (Remove from this day), or the usual menu. An idea planned this way first becomes a task.
- The 14-day plan is read after each sync and kept on the device: the page works offline, each write goes into a queue.

### Projects, tags, notes, completed

- **Projets** (Projects) grouped by area, with no cards or progress bar: dot or icon, name, next task, number of open ones. « Pas touché depuis 30 jours » (Untouched for 30 days) lists dormant projects. A project's status is changed through its menu (Non commencé, Prévu, En cours, En attente, En pause, Terminé, Abandonné, Archivé: Not started, Planned, In progress, Waiting, Paused, Done, Abandoned, Archived); "En pause" files them in the **Stash**. **Subprojects** show on the parent's page; a parent project has a **Tableau** (Board) view (one column per ongoing subproject). See [Projects-and-Areas](Projects-and-Areas).
- **Étiquettes** (Tags) in a collapsible tree (filtering by a parent includes its children), with their icons.
- **Notes** in a grid of cards, full-screen editor in outline form (see [Notes-and-Outliner](Notes-and-Outliner)): a single bar above the keyboard offers indent, move up, move down, collapse, zoom, checkbox, then formatting (bold, italic, heading, lists, link, `[[`, `@`, table).
- **Terminées** (Completed): the history, with « Rouvrir » (Reopen).

### The task row

Title on two lines, then a meta line (date and time, project in its color, tags). Only one color counts: the project's color; a high priority shows as a red outline on the square checkbox. Calendar events have a **round** checkbox, in their calendar's color.

**Long press**: a single menu, everywhere: Ouvrir, Terminer, Date, Priorité, Projet, Épingler, Dupliquer, Transformer en projet, Copier le lien ou le titre, Supprimer (Open, Complete, Date, Priority, Project, Pin, Duplicate, Turn into a project, Copy the link or the title, Delete) (with « Annuler » (Undo)), with the gestures specific to the screen at the top.

**Configurable swipes.** Réglages › Organisation › **Gestes** (Settings › Organization › Gestures): four slots (swipe right short, right long, left short, left long). Each takes an action: Terminer, Rouvrir, Planifier, Aujourd'hui, Demain, Reporter d'une semaine, Déplacer vers un projet, Priorité, Supprimer, or Aucune (Complete, Reopen, Plan, Today, Tomorrow, Postpone by a week, Move to a project, Priority, Delete, or None). The background changes color and the phone vibrates at each threshold. « Rétablir les gestes par défaut » (Restore default gestures) resets everything. A deletion or a move shows "Annuler" (Undo) for a few seconds.

### A task's detail

A full-screen sheet. At the top: back, title editable in place, focus timer, actions menu (including **Découper en étapes** (Break down into steps) and, if an agent is connected, **Discuter avec l'IA** (Discuss with the AI)). Then chips (date, priority, project, status, tags), each shown only if it has a value; the subtasks; Début → échéance (Start → due), Répétition (Repeat), Estimation, Priorité, Statut, Étiquettes, Projet, each opening its sheet; the rendered description (tap the pencil to edit the raw text); a single **Joindre · Commenter · Historique** (Attach · Comment · History) bar.

**There is no "Save" button**: each picker writes its value as soon as you choose it; the title and the note are written after a 700 ms pause and on closing. Completing is done with the checkbox next to the title.

Other elements: "**Bloque**" and "**Bloquée par**" (Blocks, Blocked by) links (add, remove, "Bloquée" mention), a project's **Prochaine tâche** (Next task), **Historique** (every change with date, time and origin: the app, a device, the AI, an accepted suggestion), comments and assignee (synced offline), attachments (online). A link in a task's name shows the page's title, icon and image; « Ouvrir le lien » (Open the link) is in the detail. For a recurring task, editing or deleting asks « Seulement celle-ci » (Only this one), « Celle-ci et les suivantes » (This one and the following ones) or « Toutes » (All); « Retirer aussi de ma journée » (Also remove from my day) is offered.

## Capture

### Quick add

The "+" button opens a sheet with **a single field**. Type as you speak: the parser turns words into chips under the field; tapping a chip removes it and gives the word back to the title.

| You type | Result |
|---|---|
| aujourd'hui, demain, après-demain, a weekday name (today, tomorrow, the day after tomorrow) | the date (the next named day; "lundi prochain" (next Monday) = that weekday of the following week) |
| dans 3 jours, dans 2 semaines, dans 1 mois (in 3 days, in 2 weeks, in 1 month) | the relative date |
| ce soir (this evening) | today at 19:00 |
| ce week-end, semaine prochaine (this weekend, next week) | Saturday, Monday |
| à 14h, 14h30, 14:30, midi (at 2 pm, 2:30 pm, noon) | the time |
| `!1` to `!3` | the priority |
| `+projet` or `^projet` (`+project` or `^project`) | the project |
| `#nom` (`#name`) | a tag, otherwise a project |
| `@étiquette` (`@tag`) | a tag |

A word that designates nothing existing stays in the title. « Plus d'options » (More options) opens priority, project, tags. After each add, **the keyboard stays up** to type in series; « Annuler la dernière » (Undo the last one) catches a mistake; « Terminé » (Done) closes. A **lone web address** offers Inbox · Tâche · Liens · Note (Inbox, Task, Links, Note) (« Dans les liens » (In links) straight away if it is already kept).

### Inbox

The **Inbox** tab: a « Capturer une idée... » (Capture an idea...) field, the ideas in a list with the actions « Aujourd'hui » (Today) and "..." (Planifier, Projet, Note, Modifier: Plan, Project, Note, Edit). The "+" there opens a capture with an **Inbox / Tâche / Note** (Inbox / Task / Note) target, as on the web. See [Inbox-and-Capture](Inbox-and-Capture).

### From another app

- **Share** a link or a text to Cadence: the « Ajouter à Cadence » (Add to Cadence) sheet offers Inbox, Tâche, Projet... or Note (Task, Project, Note), and a **Échéance** (Due date) row (Aujourd'hui, Demain, Ce week-end, Choisir: Today, Tomorrow, This weekend, Choose; tapping the chosen date removes it). With a due date, the task no longer goes through "Tâches à classer" (Tasks to sort). If the address is already in a task or a project, the sheet says « Déjà dans « ... » » (Already in "...") with Ouvrir (Open) or « Ajouter quand même » (Add anyway).
- **Select text** then the "Cadence" action of the selection menu.
- The **"Capturer" (Capture) tile** of the phone's quick settings.
- The **Proches** app (companion app, Android only) can hand over an accepted proposal as a task: only the app whose signature is the expected one is accepted, the task is created only once even if the handover is replayed, and it syncs like a typed task.

## Widgets

Long press on the home screen › Widgets › Cadence. They are configured with a long press then "Configurer" (Configure), or in Réglages › Personnalisation › **Widgets**.

| Widget | Content |
|---|---|
| **Aujourd'hui** (Today) (the one to prefer) | Header (scope title, counter, "+" and "..."), tasks, calendar events and the day's habits |
| **Cadence – Barre de capture** (Capture bar) (4×1) | « Nouvelle tâche... » (New task...), « Idée » (Idea), « Dicter » (Dictate) |
| **Cadence – Ajouter** (Add) (1×1) | A quick add button |
| **Cadence – Tâches 2×2** (Tasks 2×2) | The day's tasks in small format, tickable from the home screen |
| **Cadence – Liste (ancien)** (List (old)) | The old list, kept for existing installations |
| Habits widget | The habits to log in one gesture |

The **Aujourd'hui** widget can be tuned finely: **background** Verre (Glass) (default, adjustable opacity), Automatique (Automatic), Clair (Light), Sombre (Dark) or Aucun (None); checkbox color (Priorité (Priority) by default, Blanc (White), Projet (Project), Indigo, Corail (Coral), Menthe (Mint), Ambre (Amber) or free); Tasks and Habits modules, their order; **scope** (En retard + aujourd'hui (Overdue + today), Aujourd'hui, Demain, next 3 or 7 days, Sans date (No date), Inbox, a project), filters (projects, tags, high priority, hide recurring), sort, grouping by day (Hier, Aujourd'hui, Demain, dates: Yesterday, Today, Tomorrow), ticking from the widget, text size, corner radius. Under 180 dp on an axis (2×1, 2×2), it switches to compact mode: the counter and the next thing to do, tapped to open.

Special cases: a widget tick returns control immediately; unticking really undoes; a tap on a task opens it even if the app is already open; the widget no longer "jumps" after a tick or an add.

## Agenda

A **Jour · 3 jours · Mois · Liste** (Day · 3 days · Month · List) selector. Swipe horizontally to change period (day ±1, 3 days ±3, month ±1, list ±30 days).

- **Jour** (Day): week strip, "**À planifier**" (To plan) drawer (dragging a task onto the grid gives it its date and time), "all-day" row, hour grid, "now" line. The Agenda follows the visible hours set on the web and greys out what falls outside working hours. A planned task is resized by its handle.
- **Device events** (the phone's calendars, Google accounts included): a tap opens a detail sheet (time, calendar, place, description). **Masquer ici** (Hide here) removes the occurrence from Cadence only (Agenda, Tasks, widget), never at the provider; "Annuler" (Undo) is offered, and Réglages › Organisation › **Agendas** (Settings › Organization › Calendars) lists them so you can restore them. Ticking an event marks it done in Cadence only. **Cocher une fois passé** (Tick once past) (per calendar) displays finished events as done. These ticks and hides stay local: they do not sync.
- **Affichage** (Display): switches (tasks with a time, habits, completed, weekends, week number) and the list of calendars, the same as in Réglages › Agendas (per account: use, Agenda, Tâches, Notifications, Cocher une fois passé); the sheet's footer leads to « Tous les réglages des agendas » (All calendar settings).
- The **subscribed ICS calendars** on the server show in the Agenda (online). **Google Calendar and Tasks** connect in Réglages › Agendas (« Connecter Google » (Connect Google) opens the connection in the browser and returns to the app). See [Agenda-and-Calendar](Agenda-and-Calendar).

In the Tasks list, a calendar event is a row like a task: the "Terminer" (Complete) swipe ticks it, "Supprimer" (Delete) hides it.

## Habits

Two segments: **Aujourd'hui** (Today) and **Toutes** (All) (abstinences, habits, free activities, groups). Quick logging with a "+1" or a timer; a habit's detail gives its goal, streak and period; **learned questions** ask you the next day, at the chosen time, what is missing on a usual day (Non, Oui, Oui + quantité: No, Yes, Yes + amount). Dedicated settings: « Moments de la journée » (Times of day) (groups), « Mode voyage » (Travel mode), **Health Connect**. Everything is detailed in [Habits](Habits).

## Bilan (Insights)

The **Bilan** tab: « Semaine du ... » (Week of ...), three indicators (completed this week with last week for comparison, overdue, habit regularity over 30 days), the week's tasks by project, a Goals card, the **Revue** (Review) (À décider, Repoussées, Projets, Plus tard, Anciennes, Semaine: To decide, Postponed, Projects, Later, Old, Week, with weekly capacity, « Aide-moi à choisir » (Help me choose), a quick review of about 5 minutes, never more than 10 items), and the AI's **Week-end** and **Carrière** (Career) panels. The review is computed by the server: offline, the last reading stays visible. See [Review-Insights-and-Focus](Review-Insights-and-Focus), [Goals](Goals) and [AI-and-Proposals](AI-and-Proposals).

## AI on Android

No AI button appears when no agent is listening to the server. Otherwise:

- **Planifier ma semaine** (Plan my week) and **Préparer ma revue** (Prepare my review) (a bottom sheet, grouped by day, « Appliquer (N) » (Apply (N))), **Carrière** (Career), **Week-end**, **Décider** (Decide), **Trier mes mails** (Sort my mail): all described in [AI-and-Proposals](AI-and-Proposals) and [Mail-Triage](Mail-Triage). They need a connection: offline, the actions say "Hors ligne" (Offline) and keep nothing.
- **The morning ritual**: in the morning, when the AI has replanned your overdue tasks, the notification « N retards replacés, à valider » (N overdue tasks replanned, to confirm) opens three steps of big cards. (0) « Mails » (Mails): the deck of mails to sort, if there are any. (1) « Hier et retards » (Yesterday and overdue): one card per overdue task, with the AI's advice highlighted; swipe right follows the advice, left = Demain (Tomorrow), up = Plus tard (Later); or big buttons (Aujourd'hui, Demain, Plus..., Faite, Abandonner: Today, Tomorrow, Later..., Done, Abandon), with "Annuler" (Undo) to go back one card. (2) « Ta journée » (Your day): « Ce qui compte » (What matters) (up to 3 starred tasks), the events, the day's tasks, the load (« 3 h prévues · 4 h libres » (3 h planned · 4 h free)), « Pas aujourd'hui » (Not today) to send back to tomorrow. « C'est parti » (Let's go) applies everything in one call and opens Today; « Plus tard » (Later) closes without applying. Nothing is written before the last step.
- **Automatic filing** (Classement automatique): notifications with « Tout accepter » (Accept all) / « Ignorer » (Ignore) / « Ouvrir » (Open).
- **Discuter avec l'IA** (Discuss with the AI) and **Découper en étapes** (Break down into steps) in the task detail.
- **Settings**: Organisation › Classement automatique and À trier (Organization › Automatic filing and To sort).

## Notifications and reminders

Réglages › Organisation › **Notifications**: « Une seule voix : le téléphone sonne, calmement. » (One voice: the phone rings, calmly.)

- **Fixed-time tasks**: a task that has a time rings at that time, with no reminder to set; a chosen reminder takes precedence. Android only lets it ring to the minute if you grant "Alarmes et rappels" (Alarms and reminders) (« Heure exacte » (Exact time)); otherwise to within about a minute.
- **Reminder buttons**: Terminer, Plus tard · 10 min, À la fin, Demain (Complete, Later · 10 min, At the end, Tomorrow).
- **Calendar events**: a reminder before the start (on time or N minutes before, adjustable per calendar), « Dans N min · titre » (In N min · title), buttons Fait, À la fin, 10 min (Done, At the end, 10 min). Option « Résumé des journées entières à 8 h » (All-day summary at 8 am). The same event present on several calendars only rings once.
- **Habits**: reminder at the time set on the habit, as long as the habit remains to be done.
- **Quiet hours**: set in your profile, on the web; everything that falls in them rings at their end.
- **Agents**: « Notifications instantanées des agents » (Instant agent notifications) keeps a permanent (hideable) notification to receive the agent's messages right away, in « Agents · à décider » (Agents · to decide) or « Agents · infos » (Agents · info); « Ne pas optimiser la batterie » (Do not optimize battery) prevents the phone from cutting the connection in standby. A one-line banner at the top of screens shows the last unread message (« Ouvrir » (Open), « Marquer comme lu » (Mark as read), "+N"). « Répondre » (Reply) on an agent notification sends a free answer, kept on the phone until it is sent. A notification read elsewhere disappears.
- The **Notifications** list (bell) only shows what still waits for you: proposals, mails to sort, decisions, agent messages.
- Reminders are rescheduled after a restart, an update or a sync.

See [Notifications-and-Reminders](Notifications-and-Reminders).

## Settings map

| Section | Pages |
|---|---|
| **Personnalisation** (Personalization) | Apparence (Appearance), Widgets |
| **Organisation** (Organization) | Agendas (Calendars), Notifications, Planification (Planning) (work hours, worked days, end of day, protected slots, exceptions, « Planifier change l'échéance » (Planning sets the due date)), Classement automatique (Automatic filing), À trier (To sort), Gestes (Gestures), Moments de la journée (Times of day), Mode voyage (Travel mode), Health Connect |
| **Données** (Data) | Sauvegarde (Backup) (Exporter / Importer: Export / Import), Compte Cadence (Cadence account), Synchronisation (Sync), Plugins (administrator only) |

The administrator's **Plugins** page shows each plugin's state, its permissions, an approval button, « Mettre à jour » (Update), « Recharger » (Reload), « Supprimer » (Delete) (see [Integrations-MCP-and-Plugins](Integrations-MCP-and-Plugins)).

## What is not on Android

Views designed for a large screen stay on the web: the AI's week preview laid over the Plan board, the Plan's merged calendar, the quarterly roadmap, a project's timeline (Gantt), the Notes/Goals/Habits panels of the sidebar. The **data** stays the same: only the screen differs. The web, for its part, does not have the device calendars or the widgets. No API key settings or MCP connector on the phone (the server takes care of that).

## Going further

- [Android design notes](https://github.com/PreciselyWrong/cadence/blob/main/android/docs/REDESIGN.md) (navigation, widgets, task row)
- [Android to web UX notes](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/ANDROID-UX-NOTES.md)
- [Offline sync](https://github.com/PreciselyWrong/cadence/blob/main/docs/30-offline-sync.md), [Notifications](https://github.com/PreciselyWrong/cadence/blob/main/docs/36-notifications.md), [Morning ritual](https://github.com/PreciselyWrong/cadence/blob/main/docs/50-morning-ritual.md), [Handover from Proches](https://github.com/PreciselyWrong/cadence/blob/main/docs/42-proches-handoff.md)
