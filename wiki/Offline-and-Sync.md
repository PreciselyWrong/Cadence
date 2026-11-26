# Offline and Sync

Cadence stays usable when the server is unreachable (subway, plane, home network outage): you keep reading, adding, ticking, rescheduling; changes leave as soon as the server is back, in order, without duplicates, and the rare disagreements are made visible instead of being silently overwritten.

## Three ways to stay offline

| Client | How | What is kept |
|---|---|---|
| **Android** | A full local copy (Room database) synced by a dedicated protocol (`/api/v1/sync`) | Everything, including habits; the app is "offline first" |
| **Web (browser)** and **Linux client** | A service worker keeps the application and the server's latest responses, and queues your writes | Screens already opened once online, plus your pending writes |
| **Firefox add-on** | Nothing: it only saves online | Nothing ("Server unreachable. Nothing was saved." message) |

What stays **online only**, everywhere: the AI (filing, proposals, previews), sign-in, push notifications, CalDAV and calendar feeds, Google sync, Telegram, MCP pairing, administration, link previews, file uploads (attachments, banners, avatars). These functions answer "unavailable" offline and the screen shows its usual error.

## Web and Linux client

### What works without a server

- **The application opens**: the shell (about 5 MB) is cached when the service worker is installed.
- **Reading** comes from the latest cached responses, with **your pending writes laid on top**: a task created offline appears right away in the list and in its project's page.
- **Writes** (create, rename, tick, reschedule, delete) are kept in a queue (IndexedDB) and the service worker answers locally "it's saved". A task created offline immediately receives its identifier.
- **Screens never opened online** are empty offline: a screen is cached the first time it is opened. Open Today, Plan, Projects, Notes, Habits once before leaving.

### The pill at the bottom of the screen

A corner pill only appears when there is something to know:

| Pill | Meaning |
|---|---|
| **Offline** | The server is unreachable; nothing is waiting |
| **Offline · N waiting** | N changes are waiting to be sent |
| **Sending changes (N)** | The server is back, the queue is leaving |
| **Not saved: N** | The server refused N changes (the list gives the reason; "OK" clears it, "Retry" resends them) |
| **Conflicts: N** | After sending, N fields were changed elsewhere in the meantime (see "Conflicts"); "See conflicts" opens Profile › Sync |

The help text says: "Your changes are kept on this device and sent when the server is back."

### When are you "offline"?

A network error, no response within 4 seconds (15 seconds for a write), or a `502`/`504` from a proxy counts as unreachable. After a failure, the application answers locally right away and checks every 15 seconds whether the server is back, as well as on the browser's "online" event and when the tab regains focus.

### When the network returns

1. The queue is replayed **in order**, stopping at the first network failure. As long as writes are waiting, a new write goes behind them, even if the server is back: order is preserved.
2. Each replayed write keeps **its original modification time**, its identifier chosen at creation and an anti-duplicate key: if the response was lost, resending does not create two tasks.
3. Temporary identifiers are replaced, screens refresh.
4. A refused write (4xx error, or 500 three times in a row) is **set aside** and flagged ("Not saved").

| Situation | What happens |
|---|---|
| Session expired during the outage | On replay, the server answers 401: the queue is **kept**, you see the sign-in page again, and replay resumes as soon as the same user signs back in. Signing out clears cached responses, never pending writes |
| Another user signs in on the same machine | Writes are labelled by user: a replay never sends another user's |
| A day's plan changed elsewhere in the meantime | The plan carries a version tag: the replay is refused (`412`) and listed as "not saved" |
| A slow write (no error, just a delay) | Is not taken for an outage: it is retried at the next replay, then set aside after three tries, and reads keep reaching the server |
| An "online only" function left in the queue by an old version | It is dropped on replay and never sent |

### Limits to know

- Counters, the computed order and the next occurrence of a recurring task are those of the last online read, until the network returns.
- A screen that keeps its rows in its own state may display the offline value even if a conflict kept the other value: reopen the screen.
- Habits ticked offline leave when the network returns, but the progress shown offline is the last cached one.
- A tag list edited offline **wins** over a more recent tag change made elsewhere (the link table has no per-row clock).
- Server-side search only answers on what has been cached.

### Linux client

The main window is a web view on your server's address: it registers the same service worker, stored in the application's data folder. If the server is unreachable at launch, the cached shell is shown. The global quick add (`Ctrl+Alt+Space`) also has its **own capture queue** in the system tray process. See [Linux Client and Firefox](Linux-Client-and-Firefox).

## Android

### First connection and sync

1. Réglages › Données › **Compte Cadence** (Settings › Data › Cadence account): « Scanner le code QR » (Scan the QR code; created in Profile › API Keys on the web) or enter the server address and the key.
2. The phone takes a **full copy** (snapshot), page by page, then only asks for changes since its cursor.
3. Each local write leaves as soon as the network is there, and a periodic pass runs about every 15 minutes. A missed pass (server unreachable) is retried with exponential backoff (30 seconds, 1 minute, 2 minutes...) as long as the network is there, without holding back the following syncs.
4. « Synchroniser maintenant » (Sync now) forces a pass.

**What is synced**: tasks, projects, areas, tags, notes, inbox ideas, goals (and key results), links, comments and task assignment, project sections (Kanban), the 15 kinds of **habit** data (habits, goals, schedules, entries, pauses, groups, reminders, quick values, timers, Health Connect rules, abstinence, alcohol, learned questions...). Habits of a former account are never sent to another account: the app asks to keep them on the phone only, or to delete them.

**What stays local to this phone**: ticked boxes and hidden events of the device calendar, reminder postponement (« Plus tard · 10 min », Later · 10 min), widget configuration, focus timer, display settings.

**What needs a connection**: Review (computed by the server; the last read stays visible, « Hors ligne · lecture du... », Offline · read on...), AI proposals, link previews, attachments, the Google connection, "Break down into steps", the Réglages › Classement automatique (Settings › Auto filing), À trier (To sort) and Plugins screens.

A task not yet sent is flagged « Modification non synchronisée » (Change not synced). The status banner says « Hors ligne : envoyé dès le retour du réseau » (Offline: sent as soon as the network returns) when this is the case.

### How a change is sent

Each field carries a **hybrid clock**; each write has a unique identifier and the server applies it only once (replaying the same write returns the same result without redoing anything). The phone chooses the identifier of a new task itself: a task created offline then edited several times remains the same task.

- Before each pass, the phone reads what the server can do. A data type unknown to the server (older server) **stays pending**; the Sync screen says « Ce serveur ne connaît pas encore : ... » (This server does not know yet: ...).
- A refused batch is retried in two halves (24 requests at most per pass) to isolate the faulty write: it is marked refused (4xx) or kept with the following ones of its line (500); an overload (429, 502, 503, 504) stops sending.
- A recurring task completed on two offline devices for the same day advances **only once**: the occurrence is claimed on the server side, the second is recognized as already done.

### Edge cases

| Situation | Result |
|---|---|
| You edit a title offline, someone edits it elsewhere | **Field-by-field** merge: if both touched different fields, everything is kept; on the same field, the most recent value wins and the other is kept in conflicts |
| You edit a task deleted elsewhere | **Delete wins**: the edit is refused, the task does not come back |
| The task points to a project deleted in the meantime | The task **keeps its content**: the dead reference is removed and it lands in "Tasks to sort" |
| You push a reference to another account's resource | Refused |
| Phone clock ahead by more than 24 h | The write is rejected |
| Phone left offline for a very long time | See "Compaction" below: new full copy |

## Conflicts and reconciliation

A **conflict** arises when a device sends a value *older* than the one the server holds: the server keeps its own and **retains the losing value** so that you can decide.

- **Web**: Profile › **Sync** lists the devices (last sync of each), the last change on the server, the changes made offline in this browser that are waiting, and the **open conflicts**: for each, the item ("Task", "Project"...), the field, the **kept** value and the **set aside** value, with two buttons.
  - "**Keep this value**" (the set-aside value) puts it back as a fresh edit, dated now, which passes the same checks as a device write and wins the merge: all devices receive it.
  - "**Keep the other**" changes nothing (the server value stays) and clears the conflict from the list.
  - Habits only offer "Got it".
  - Only the last loss of each field is listed; a conflict whose item no longer exists, or which already contains the lost value, does not appear.
- **Android**: Réglages › Données › **Synchronisation** (Settings › Data › Sync) shows the devices, then the server's conflicts followed by those that only the phone knows (offline or not yet read), one row per field: « Ce téléphone : ... » (This phone: ...) against « Serveur : ... » (Server: ...), « Garder ce téléphone » (Keep this phone) / « Garder le serveur » (Keep the server), « Compris » (Got it). Settling a row already known to the server also settles the phone's copy. The « Refusées par le serveur » (Refused by the server) list keeps refused writes, with « Effacer la liste » (Clear the list).
- **A web edit** is dated by the server's clock, always ahead of the clocks it has accepted: a web edit therefore wins against an older one made offline. A web write **replayed** afterwards, however, keeps its original time, and can therefore lose itself: it is then counted in "Conflicts: N".

Example: Monday at 9 am, in the subway with no network, you rename "Appeler le garage" to "Appeler le garage Dupont"; at 9:05 am, on the web, someone renames the same task to "Rappeler Dupont". When the network returns, the server keeps "Rappeler Dupont" and the conflict offers "Keep this value: Appeler le garage Dupont".

## Log compaction

The server keeps a change log. Every night, it compacts it: an entry older than **30 days** that has a follow-up for the same row is removed, and deletion marks are kept 30 days then removed (adjustable on the server, see [Self-Hosting](Self-Hosting)).

- A device that asks for changes from a point already compacted receives "reset required": it **takes a full copy again** automatically. This is the typical case of a phone left off for more than a month.
- Once the deletion mark is gone, "delete wins" no longer holds for that row: a device left offline longer than the retention period, which edits a row deleted in the meantime, would recreate it.

## Reminders and offline

Task reminders are rescheduled after a phone restart, an app update or a sync; your account's quiet hours hold task and habit reminders until their end. A "410 reset required" received during sync triggers the new full copy. See [Notifications and Reminders](Notifications-and-Reminders).

## Going further

- [Offline Sync](https://github.com/PreciselyWrong/cadence/blob/main/docs/30-offline-sync.md): protocol, entities, merge rules
- [Web UI offline](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/WEB-OFFLINE.md): service worker, write queue, limits
- Related pages: [Android](Android), [Linux Client and Firefox](Linux-Client-and-Firefox), [Habits](Habits)
