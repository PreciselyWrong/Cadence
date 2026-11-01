# Linux desktop client (`desktop/`)

Tauri 2 shell around the user's own Cadence server. It adds what a browser tab cannot do; everything else is the web UI, unchanged (session cookie, CSRF, i18n).

## Decisions

- **Thin shell.** The main window loads the server URL (default `http://cadence.lan`, set on first launch). No front-end build, no bundled React, no IPC for the remote page: the web UI gets no access to the app's commands (`build.rs` app manifest + `capabilities/local-pages.json` grant them only to the local setup and quick-add pages).
- **"SQLite hors ligne" scope: captures only.** The offline store is a queue of quick-add captures, one JSON file each in `~/.local/share/ch.nicolab.cadence.desktop/queue/`. It is not a replica of tasks or projects, and no `tauri-plugin-sql`/SQLite is used: a replica would duplicate the sync client for little gain on a desktop that is nearly always online. If a full offline desktop is wanted later, it goes through `/api/v1/sync` ([30-offline-sync.md](../30-offline-sync.md)).
- **Two roles, one binary.** The *tray process* (default) never creates a webview and idles at about 60 MB RSS. Each window (`--ui main|quick|settings`) is its own process that exits on close, because WebKitGTK keeps its helper processes (about 300 MB) alive after a window closes inside the same process.
- **Token in a 0600 file**, not the OS keyring: no extra dependency, same exposure as an SSH key. Keyring (Secret Service) is a possible follow-up.

## Features

| Feature | How |
|---|---|
| Tray icon | Menu: Ouvrir, Ajout rapide, Réglages, Quitter. Closing the window leaves the tray running. |
| Quick add | `Ctrl+Alt+Space` (config `shortcut`) opens a small always-on-top field; Enter stores the capture and closes. |
| Offline captures | The tray process posts the queue to `POST /api/inbox` (`Authorization: Bearer tt_...`, `source: "desktop"`) as soon as it can, then every 60 s while the server is unreachable. |
| Notifications | Every `poll_seconds` (60) `GET /api/notifications?includeRead=false&limit=20`; each unread notification whose `sources` contain `desktop` and whose `deliver_after` (quiet hours) has passed becomes a native notification once, deduplicated by notification `uid` (the last 500 are kept in `state.json`), window or not. The first poll only records a baseline. See [36-notifications.md](../36-notifications.md). |

## Configuration

`~/.config/ch.nicolab.cadence.desktop/config.json` (created by the first-launch settings window, editable by hand, picked up within 2 s):

```json
{ "server_url": "http://cadence.lan", "api_token": "tt_...", "shortcut": "Ctrl+Alt+Space", "poll_seconds": 60 }
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

Flags: `--quick` (open quick add; use it as the command of a desktop shortcut), `--background` (tray only, for autostart). A second launch forwards its flags to the running tray process.

## Known limits

- **Wayland (KDE, GNOME):** the global shortcut is an X11 grab and does not fire in Wayland sessions. Bind `cadence-desktop --quick` to a key in the desktop's own shortcut settings instead.
- **Duplicates:** a capture is sent at least once. If the server stores it but the answer is lost (timeout), the retry creates a second inbox item. `POST /api/inbox` has no idempotency key; `/api/v1/sync/push` would give exactly-once.
- Clicking a notification does not open the app; "Ouvrir" on an already open window does not raise it.
- Strings of the setup and quick-add pages are French/English only, not in the 26 web locales.
- Tray on GNOME needs the AppIndicator extension.

## Verification (2026-10-31, Fedora 44, KDE Wayland)

- `tauri build --bundles rpm,appimage`: RPM 2.7 MB, AppImage 109 MB.
- Idle in the tray: RSS 60-63 MB (PSS 33 MB), no WebKit process. With the main window open: about 430 MB; with quick add open: about 180 MB plus helpers. All of it is released on close.
- Quick add typed into the real window, Enter: the item appeared in `GET /api/inbox` with `source: "desktop"`. With the server frozen the capture stayed in the queue and was delivered after the server resumed.
- A server notification created while only the tray ran reached `org.freedesktop.Notifications` (seen with `dbus-monitor`).
