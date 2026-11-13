# Linux desktop client (`desktop/`)

Tauri 2 shell around the user's own Cadence server. It adds what a browser tab cannot do; everything else is the web UI, unchanged (session cookie, CSRF, i18n).

## Decisions

- **Thin shell.** The main window loads the server URL (default `http://cadence.lan`, set on first launch). No front-end build, no bundled React, no IPC for the remote page: the web UI gets no access to the app's commands (`build.rs` app manifest + `capabilities/local-pages.json` grant them only to the local setup and quick-add pages).
- **Offline: the web UI's own, plus a capture queue.** The main window works offline through the web UI's service worker, which WebKitGTK runs for the server's https origin: cached shell and answers, an outbox of writes replayed with their edit time ([WEB-OFFLINE.md](WEB-OFFLINE.md)). The tray process keeps its own queue of quick-add captures, one JSON file each in `~/.local/share/ch.nicolab.cadence.desktop/queue/`, since it has no webview. No `tauri-plugin-sql`/SQLite: it would need capabilities for the remote window (⛔) and duplicate the browser's offline layer.
- **Two roles, one binary.** The *tray process* (default) never creates a webview and idles at about 60 MB RSS. Each window (`--ui main|quick|settings`) is its own process that exits on close, because WebKitGTK keeps its helper processes (about 300 MB) alive after a window closes inside the same process.
- **Token in a 0600 file**, not the OS keyring: no extra dependency, same exposure as an SSH key. Keyring (Secret Service) is a possible follow-up.

## Features

| Feature | How |
|---|---|
| Main window controls | A local GTK header bar (`src-tauri/src/titlebar.rs`) replaces the system title bar with Cadence colours and Minimize, Maximize/Restore and Close buttons. GTK handles dragging; the buttons call the Tauri window from Rust. The server page keeps no Tauri capability. |
| Tray icon | Left click: the tasks of the day (`/today`). Right click: the menu, Ouvrir, Ajout rapide, Réglages, Quitter. Closing the window leaves the tray running. The icon uses the KSNI backend of `tray-icon`, added as a direct dependency: Tauri's default libappindicator never reports a click on Linux. |
| Quick add | `Ctrl+Alt+Space` (config `shortcut`) opens a small always-on-top field (560 x 76 px); Enter stores the capture and closes. On X11 the key is grabbed by the global-shortcut plugin; under Wayland it is bound through the XDG GlobalShortcuts portal (see below). |
| Offline captures | The tray process posts the queue to `POST /api/inbox` (`Authorization: Bearer tt_...`, `source: "desktop"`) as soon as it can, then every 60 s while the server is unreachable. Each capture carries an `Idempotency-Key` (a uuid stored in its queue file), the same on every retry, so the server stores it once. |
| Autostart | Settings checkbox, off by default. On writes `~/.config/autostart/cadence-desktop.desktop` (`Exec=... --background`, the AppImage file when run from one); off removes it. The file is the source of truth. |
| External links | The main window stays on the configured server (`src-tauri/src/links.rs`). A click on a link to another origin (scheme, host and port compared; a subdomain or `https` for an `http` server is another origin), and every `target="_blank"` or `window.open` to another origin, opens in the desktop's default app through `xdg-open`; `mailto:` and `tel:` too. Only `http`, `https`, `mailto` and `tel` are handed over; `file:`, `data:`, `javascript:` and custom schemes are dropped. Navigations that are not a link click stay in the window, so the welcome video iframe and a sign-in through another site (OIDC, Google connect) still work; a `window.open` to the server itself (attachment download) loads in the main window. WebKit's `decide-policy` and `create` signals are handled directly: Tauri's `on_navigation` only gets the URL and answers every decision first, so its handler is removed from this window (it only runs plugin hooks, and the window has none). The window opens at `about:blank` and loads Cadence once the policy and user agent are set. Set `server_url` to the address the server answers on: if it redirects to another origin, its pages count as external. |
| User agent | The main window keeps WebKitGTK's user agent and appends ` CadenceDesktop/<version>` (crate version); the web UI hides its notification bell when it sees `CadenceDesktop/`, native notifications replace it; in Profile › Notifications it shows a « Notifications of this app » card (with a Test button for the Desktop channel) instead of the browser push card. |
| Notifications | Every `poll_seconds` (60), and at once when the live stream (`GET /api/notifications/stream`, held open by the tray process, reconnecting after 5 s then up to 60 s) announces one, `GET /api/notifications?includeRead=false&limit=20`; each unread notification whose `sources` contain `desktop` and whose `deliver_after` (quiet hours) has passed becomes a native notification once, deduplicated by notification `uid` (the last 500 are kept in `state.json`), window or not. Shown with `notify-rust` over D-Bus (`src-tauri/src/notify.rs`), not the Tauri plugin: app name `Cadence`, icon `cadence-desktop`, `desktop-entry` hint `ch.nicolab.cadence.desktop` so the shell links it to the installed app. Text by `data.reason`: `task_reminder` shows the task name and "Rappel", `timed_task` the task name and "Échéance", `habit_reminder` the habit name and "Habitude", `defer_until_reached` the task name and "Disponible maintenant"; any other notification keeps the server's title and message (the body is dropped when it repeats the title). A task reminder (`task_reminder`, `timed_task`, `defer_until_reached`) reads its task with `GET /api/task/<uid>` and shows, in body markup, `Rappel · 14:30 · **Projet** · 25 min` with the first line of the note in italics below, and the project colour as a ring image (`image-path` to an SVG the tray writes once per colour in `notify-icons/`; only `#rrggbb` colours are used); if the read fails the label alone is shown. Server text is escaped, never read as markup. Buttons (three at most, GNOME's limit): **Terminé** on task reminders, **+10 min** on every reminder, **Ouvrir** when there is a related item; a click on the body also opens it. Terminé sends `PATCH /api/task/<uid>` `{"status":2}` from the tray process with the API key and an `Idempotency-Key` (one uuid per click, sent again on the single retry after a lost answer, so a recurring task advances once); on failure a notification says so. +10 min stores the alert in `state.json` (tray process only) and shows it again 10 minutes later, also after a restart. `task_reminder` and `timed_task` stay on screen until acted on (expire timeout 0); the others expire into the history. No `category`, `sound-name` or `resident` hint: Plasma does not render a category, plays its own sound per app, and `resident` would keep a reminder after Terminé. A click on the body, or on "Ouvrir", opens the main window on the item (`data.taskUid` to `/task/<uid>`, `data.projectUid` to `/project/<uid>`, a plugin's `data.openPath` when it is a path inside Cadence, else the home page). An agent's message (a plugin notification) shows the agent's name in bold before the text, offers **Répondre** when it carries a `replyPath` (opens the message with its reply field focused, `?reply=1`), and takes its urgency from the level (`error` critical, `success` low). A `notification_read` event on the live stream closes the notifications read elsewhere (`gdbus` `CloseNotification` with the id kept in memory by the tray process); an already open main window is retargeted and raised. The first poll only records a baseline. See [36-notifications.md](../36-notifications.md). |

## Configuration

`~/.config/ch.nicolab.cadence.desktop/config.json` (created by the first-launch settings window, editable by hand, picked up within 2 s):

```json
{ "server_url": "http://cadence.lan", "api_token": "tt_...", "shortcut": "Ctrl+Alt+Space", "poll_seconds": 60, "autostart": false }
```

Create the key in the web app: Profile, API keys. Without a key the web window works but quick add and notifications stay idle.

## Run and build

```bash
cd desktop && npm install
npm run dev              # tauri dev
npm run build            # RPM + AppImage -> src-tauri/target/release/bundle/
npm run build:bin        # bare binary, no packaging
CARGO_BUILD_JOBS=6 npm run build   # when the machine is busy
```

Fedora build dependencies: `sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel openssl-devel rpm-build`. The AppImage bundler downloads linuxdeploy on first use.

Flags: `--quick` (open quick add; use it as the command of a desktop shortcut), `--background` (tray only, for autostart). A second launch forwards its flags to the running tray process: without `--quick` it opens the main window or, when it is already open, restores and raises it.

The tray process drives its window processes over their stdin (`focus`, `goto /route`, one per line): that is how "Ouvrir" raises a window and how a notification click retargets the main window, since a window cannot be reached from another process any other way. The RPM also installs a hidden `ch.nicolab.cadence.desktop.desktop` (the app id), which the portal needs to name the app.

## Known limits

- **Wayland shortcut:** bound through `org.freedesktop.portal.GlobalShortcuts` (`ashpd`, tray process). The desktop asks the user to confirm the binding on the first run and owns the key afterwards: change it in the desktop's shortcut settings, the `shortcut` config value is only the first suggestion. The portal can refuse a suggestion that another app already holds (on the maintainer's machine `Ctrl+Alt+Space` is taken by the Claude desktop app, so the action is created unassigned until the user picks a key). If the portal is missing, the plugin's X11 grab is tried. The key press only reaches the app when the app id is known: install the RPM (hidden desktop file) or, for the AppImage, put a `ch.nicolab.cadence.desktop.desktop` in `~/.local/share/applications`; otherwise the portal files the shortcut under whatever app the process was started from. `cadence-desktop --quick` bound in the desktop's own settings also works everywhere.
- **Duplicates:** a capture is sent at least once; the `Idempotency-Key` makes the server (`backend/middleware/idempotency.js`, 24 h window per user) return the first answer for a retry instead of creating a second inbox item. A server without the middleware ignores the header and a lost answer can still duplicate.
- **Wayland focus:** raising a window uses the toolkit's focus request; the compositor may only flash the taskbar entry instead of focusing (focus-stealing prevention).
- Strings of the setup and quick-add pages are French/English only, not in the 26 web locales.
- Tray on GNOME needs the AppIndicator extension; without a tray host the app keeps running and retries.

## Verification (2026-11-06, tray icon)

On a private session bus with a mock `StatusNotifierWatcher` (the real KDE panel was not used, so a click on the panel itself remains to be seen): the item registers with `ItemIsMenu` false and a `Menu`; calling `Activate` starts `--ui main --path /today`; the `clicked` event of the menu's Réglages opens the settings. With no watcher at start, the app stays up and the icon registers as soon as one appears (the 5 s retry): KSNI fails where libappindicator waited, and without this the app would crash when it starts before the panel.

## Verification (2026-11-12, external links)

Release binary, `--ui main` against a local mock page on `127.0.0.1:4181` with a fake `xdg-open` on `PATH` that records its arguments; the page clicks its own links. Recorded: `http://localhost:4181/clicked` (link to another origin), `mailto:a@example.com`, and, with WebKit's popup blocker lifted in a throwaway build (script clicks carry no user gesture), `http://localhost:4181/popup` (`window.open`) and `http://localhost:4181/blank-target` (`target="_blank"`). Not handed over: `file:///etc/hostname`. The window stayed on `/start`, a same-origin link loaded `/second` in the window, the cross-origin iframe loaded in place, and the page saw `... Safari/605.1.15 CadenceDesktop/0.1.0`. Not seen yet: a real click opening Firefox through the installed RPM.

## Verification (2026-11-12, rich notifications, KDE Plasma 6.8.2 Wayland)

What the server renders, from `GetServerInformation` (`Plasma`, `KDE`, `6.8.2`, spec `1.2`), `GetCapabilities` (`body`, `body-hyperlinks`, `body-markup`, `body-images`, `icon-static`, `actions`, `persistence`, `inline-reply`, `sound`, `x-kde-urls`, `x-kde-origin-name`, `x-kde-display-appname`, `inhibitions`) and the Plasma 6.8 sources:

- Body markup: `b`, `i`, `u`, `a`, `img` (local files only), `br`, `table`/`tr`/`td`; other tags are dropped (`libnotificationmanager/notification.cpp`, `sanitize`). Popups show up to 8 body lines (`NotificationPopup.qml`).
- Images: `image-data`, then `image-path`, scaled to at most 256 px, shown at the large icon size (48 px) beside the text, and only when it differs from the app icon (`components/Icon.qml`).
- Buttons: every action is a button in one row, no cap (`components/ActionContainer.qml`); in the history the `default` action gets a button unless its label is already one, which is why `default` is labelled "Ouvrir" like the button. GNOME Shell shows at most three, so Cadence sends three.
- `urgency` critical never expires; `resident`, `transient`, `category`, `x-kde-*` are read; `sound-name` is not used by the applet.

Seen on this desktop: the ignored test `shows_a_sample_notification` showed a task reminder with title, `Rappel · 14:30 · Admin & Co · 1 h 30`, the italic note, the blue ring and Terminé / +10 min / Ouvrir; a habit with +10 min only; a comment with Ouvrir only. 15 s later only the task reminder was still on screen. Against the mock server `src-tauri/tests/notifd.py` on a private bus (`a_click_reaches_its_choice`), `ActionInvoked` with `done`, `snooze`, `open` and `default` each reached its choice, and the Notify call carried the three buttons, `desktop-entry`, `image-path`, `urgency` and timeout 0. The Terminé request (method, path, bearer, body, same key on retry, no retry on 4xx) is unit-tested against a local HTTP server, and the server side by `backend/tests/integration/task-patch-idempotency.test.js`. Not seen yet: a real click on Terminé through the installed RPM against the real server.

## Verification (2026-11-12, Fedora 44, KDE Plasma 6 Wayland)

- Notification look: a sample sent by `notify.rs` (ignored test `shows_a_sample_notification`) showed on the real Plasma as "Cadence" with the app icon, the task name as title, "Rappel" below and an "Ouvrir" button. Plasma drops the buttons once the sender leaves the bus, so the test stays up 20 s; the tray process is always up.
- Click: against a mock `org.freedesktop.Notifications` on a private bus, `ActionInvoked` with `default` and with `open` both called back with `/task/abc`.
- Not seen yet: a real server reminder through the installed RPM, and whether Plasma closes a notification kept in its history (each shown notification keeps one thread waiting for its click until it closes).

## Verification (2026-11-01, Fedora 44, KDE Plasma 6.7 Wayland)

Done with a debug build, a mock server on 127.0.0.1, an isolated `XDG_CONFIG_HOME`/`XDG_DATA_HOME` and a locked screen (no mouse or keyboard input, so dialogs could not be answered and the settings page was not looked at):

- Portal shortcut: `CreateSession` and `BindShortcuts` reach xdg-desktop-portal-kde (seen with `busctl monitor`); invoking the action through `org.kde.kglobalaccel` `invokeShortcut` produced `Activated`, which opened the quick-add window. With the app id registered (temporary desktop file) the bind waited on KDE's confirmation dialog, which nobody could answer. Not verified: a real key press, and the dialog flow end to end.
- Quick-add window measured through a KWin script: 560 x 76 px (it was 200 px high before; GTK ignored `resizable(false)`, the fix is min = max inner size).
- Notification click: with a mock `org.freedesktop.Notifications` server on a private bus, the notification offered the `default` action, its `ActionInvoked` opened the main window at `/task/<uid>` (seen in the server log), a second one retargeted the open window, and a plain second launch restored a minimized main window (`active`, not minimized).
- Idempotency: a capture whose first POST was cut mid-request was retried 60 s later with the same `Idempotency-Key`; the queue file was then deleted.
- Not exercised at runtime: the autostart toggle (unit-tested only).

## Verification (2026-10-31, Fedora 44, KDE Wayland)

- `tauri build --bundles rpm,appimage`: RPM 2.7 MB, AppImage 109 MB.
- Idle in the tray: RSS 60-63 MB (PSS 33 MB), no WebKit process. With the main window open: about 430 MB; with quick add open: about 180 MB plus helpers. All of it is released on close.
- Quick add typed into the real window, Enter: the item appeared in `GET /api/inbox` with `source: "desktop"`. With the server frozen the capture stayed in the queue and was delivered after the server resumed.
- A server notification created while only the tray ran reached `org.freedesktop.Notifications` (seen with `dbus-monitor`).
