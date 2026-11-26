# Linux client and Firefox add-on

Two small tools to capture and stay informed from your computer: the **Linux client** (a Tauri 2 shell around the web interface, with a system tray icon, global quick add and native notifications) and the **Firefox add-on** (a page or a link in the browser becomes a Cadence task in one click).

## Linux client

### What it is

A lightweight application that loads **your own Cadence server** in a window: it is the web interface, unchanged (same screens, same session, same 26 languages). It adds what a browser tab cannot do:

- a **system tray icon** (the panel, for example KDE Plasma's) that stays there with the window closed;
- **global quick add**: a small input box called up by a keyboard shortcut, from any application;
- **native system notifications** (task reminders, with their buttons);
- **offline** operation.

The window has no system title bar: the Minimize, Maximize and Close buttons are drawn in the top bar of the web interface, which also serves as the drag area (double-click: maximize or restore). The links, buttons and fields in that bar keep their click.

### Install

The client is built from `desktop/` and produces an **RPM** and an **AppImage**:

```bash
cd desktop
npm install
npm run build        # RPM + AppImage in src-tauri/target/release/bundle/
```

On Fedora, the development packages needed are `webkit2gtk4.1-devel`, `libappindicator-gtk3-devel`, `librsvg2-devel`, `openssl-devel` and `rpm-build`. On a busy machine, `CARGO_BUILD_JOBS=6 npm run build` limits the load. Then install the RPM (recommended: it also installs a hidden desktop entry that the shortcuts portal needs to name the application) or run the AppImage.

### First launch

A **Cadence settings** window asks for:

| Field | Role |
|---|---|
| **Server address** | "The one you open in the browser" (for example `https://cadence.example.com`). A link to a site other than this server opens in your default browser, not in the window. Enter the **final** address: if the server redirects to another origin, its pages count as external. |
| **API key** | A `tt_...` key created in Profile › API Keys. Needed for quick add and notifications; without it the web window works, but quick add and notifications stay inactive. |
| **Global shortcut** | `Ctrl+Alt+Space` by default. |
| **Start Cadence at login** | Off by default. Starts in the system tray, without a window. |

These values are also in `~/.config/ch.nicolab.cadence.desktop/config.json`, editable by hand (re-read within 2 seconds). The key is in a restricted-permission file (0600), not in the system keyring.

### The system tray icon

The tray menu labels are in French: they are quoted as they appear, with their meaning.

- **Left click**: opens today's tasks (`/today`).
- **Right click**: the menu **Ouvrir** (Open), **Ajout rapide** (Quick add), **Réglages** (Settings), **Quitter** (Quit).
- Closing the window **leaves the application running** in the tray. At rest, the tray process weighs about 60 MB; each window is a separate process that disappears when closed (the memory is given back).
- Under GNOME, the "AppIndicator" extension is needed to see the icon. Without a tray host, the application keeps running and tries again.

### Quick add

`Ctrl+Alt+Space` (or the shortcut you chose) opens a small input box always on top (560 × 76 px): "Capture to the inbox, then press Enter". **Enter** saves and closes; Esc cancels. The capture arrives in the **inbox** with the source "desktop". The same shortcut can be reproduced by running `cadence-desktop --quick`: you can therefore assign it in the desktop's shortcuts.

**Shortcut under KDE Plasma and Wayland.** Under Wayland, an application cannot grab a global key itself: Cadence declares it to the desktop's **shortcuts portal** (XDG GlobalShortcuts), which asks you to confirm the key on first launch, then stays its owner. To change the key afterwards, go through the desktop's shortcut settings (Cadence appears there), not through the configuration file (it is only a first suggestion).

| Situation | Result |
|---|---|
| Another application already holds the key (for example `Ctrl+Alt+Space`) | The action is created **without a key**: choose one in the desktop's shortcuts |
| The portal is absent | Cadence tries X11 key capture |
| The shortcut does not react | Install the RPM, or, with the AppImage, place a `ch.nicolab.cadence.desktop.desktop` in `~/.local/share/applications`; or assign `cadence-desktop --quick` to a key in the desktop's shortcuts, which works everywhere |
| Several launches | A second launch passes its options to the process already running: without `--quick`, it opens the main window or, if it is already open, brings it to the front |

### Offline captures

Quick add captures are kept in a local queue (one small file per capture) then sent to the inbox as soon as possible, and every **60 seconds** while the server is unreachable. Each capture carries an **anti-duplicate key** identical on every new attempt: if a response was lost, the server does not create two ideas. (A server that ignored this key could still duplicate after a lost response.)

### Main window offline

The window is a web view on your server: it registers the same **service worker** as the browser. If the server is unreachable at launch, the cached shell opens; changes are queued and replayed when the server returns, with any conflicts visible in the "Conflicts: N" badge (see [Offline-and-Sync](Offline-and-Sync)). Each screen must have been opened once online to exist offline.

### Native notifications

The tray process listens to the server (a live stream, with a fallback poll every 60 seconds) and displays, **even with the window closed**, what the server has routed to the **Desktop** channel: task reminders, fixed-time tasks, habits, tasks available again, agent messages, etc.

| Notification | Content | Buttons |
|---|---|---|
| Task reminder | The task name, then a line `Rappel · 14:30 · Projet · 25 min` (Reminder · 14:30 · Project · 25 min), the first line of the note in italics, a ring in the project's color | **Terminé** (Done), **+10 min**, **Ouvrir** (Open) |
| Habit | The habit name | **+10 min** |
| Comment, others | The server's title and message | **Ouvrir** (Open) |

- **Only once** per notification (the app remembers the last 500); your account's quiet hours are respected (a held notification goes out at their end).
- A click on the notification (or **Ouvrir**) opens the main window **on the task**, or redirects the already open window.
- **Terminé** ticks the task directly from the notification, with an anti-duplicate key (sent again as is on a new attempt, and not sent again if the server refuses).
- **+10 min** pushes the reminder back by ten minutes, locally.
- Three buttons at most, because GNOME shows no more.
- In the client's web interface, the **bell disappears**: native notifications replace it. Profile › Notifications shows a "**Notifications of this app**" card (with a test button for the Desktop channel) in place of the browser notification card. Choose the types in the "Desktop" column.

### Other details

- **Reload**: F5, Ctrl+R and Ctrl+Shift+R reload the window (the WebKit engine has no default shortcut).
- **External links**: a link to another site, `mailto:` or `tel:` opens in the default desktop application; other schemes (`file:`, `javascript:`) are ignored for safety. Signing in through another provider (OIDC, Google) works.
- The texts of the local screens (Settings and quick add) exist in French and English only, not in the web's 26 languages.
- If two windows are open at the same time (main window and quick add), memory rises (about 430 MB for the main window) and falls again when they close.

## Firefox add-on

### What it is for

It turns the **open page** or a **link** into a Cadence task. The server names the task according to the kind of page ("Essayer : ..." (Try: ...), "Lire : ..." (Read: ...), "Regarder : ..." (Watch: ...), see [Tasks](Tasks) for links). It contains no AI and has no bookmarks of its own.

Requirements: Firefox 139 or newer, a Cadence server, an API key.

### Install

The add-on is **unlisted**: private, never published on Mozilla's public catalog. Two ways:

1. **To try it**: `about:debugging` › This Firefox › "Load Temporary Add-on" › the `manifest.json` file in the `integrations/firefox-addon/` folder. It disappears when the browser closes.
2. **Permanent installation**: the package must be **signed by Mozilla** (unlisted). With your developer keys, `integrations/firefox-addon/sign.sh` produces the `.xpi` file; open it in Firefox. Increase `version` in `manifest.json` before each new signing.

### Settings

Toolbar button › **Settings** (opens in a tab):

| Field | Role |
|---|---|
| **Cadence server address** | `https` required (`http` only on a private network) |
| **API token** | Created in Cadence: Profile › API Keys |

On first save, Firefox asks for **permission to access this server**: without it, the extension cannot reach it ("Without this permission the add-on cannot reach the server."). Requests send **only the token**, never the browser's Cadence session; the add-on only has access to this server and reads no page, except the tab you save, and Gmail for its button.

### Create a task

- **Toolbar button**, or **Alt+Shift+K**: a window offers the **task name** (editable), an optional **due date** (**Today** or **Tomorrow**, toggles), then **Create the task**. The task arrives in "Tasks to sort" ("Task added to Tasks to sort.") or, with a date, directly dated.
- **"Already in "..."**: if the address is already in an open task or in a project's pages, the window says so, with **Open**; **Add anyway** overrides it.
- **Right click** on a page or a link: "Make a Cadence task" / "Make a task of this link": a task in one click, the icon shows a mark as confirmation.

### Gmail

In Gmail, the add-on adds a **"+"** button next to Archive and Delete on each row of the list (visible on hover, it opens the window without opening the mail) and a **"+ Cadence"** button near the subject of an open message. A small window opens over Gmail: the name comes from the subject, with the Today / Tomorrow choices. The task keeps the message's address and carries the origin badge "Gmail".

### Send to a project

In the window: **choose a project** (nothing is chosen until you pick one; the top task, for its part, never goes into a project). Three buttons:

- **Send to project**: adds the current tab to the project's **pages**;
- **Send the group**: adds **all the tabs** of its Firefox tab group (the button only appears in a group);
- **Open the project**: opens the project's pages in a tab group of the same name.

The result says "Pages added: N (already there: M)"; a project without pages answers "This project has no pages yet."

### Special cases

| Situation | Message |
|---|---|
| Server or token not set | "Set the server and the token first." |
| Token refused | "Token refused: check the settings." |
| Server unreachable | "Server unreachable. Nothing was saved." (no offline queue) |
| Page that cannot be saved (a Firefox internal page, for example) | "This page cannot be saved." |
| Address refused by the server | "This address was not accepted." |

## Going further

- [Linux client](https://github.com/PreciselyWrong/cadence/blob/main/docs/fork/DESKTOP.md): decisions, limits, checks
- [Links](https://github.com/PreciselyWrong/cadence/blob/main/docs/37-links.md): what an address becomes
- [Notifications](https://github.com/PreciselyWrong/cadence/blob/main/docs/36-notifications.md)
- Related pages: [Offline-and-Sync](Offline-and-Sync), [Inbox-and-Capture](Inbox-and-Capture), [Notifications-and-Reminders](Notifications-and-Reminders), [Integrations-MCP-and-Plugins](Integrations-MCP-and-Plugins)
