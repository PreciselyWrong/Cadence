# AGENTS.md — desktop (Tauri 2)

Thin Linux shell around the Cadence web UI. Read `docs/fork/DESKTOP.md` first (decisions, limits).

- `src-tauri/src/main.rs`: tray process and UI process (`--ui`); `sync.rs`: capture queue, inbox flush, notification polling and wording; `notify.rs`: native notifications over D-Bus (`notify-rust`, desktop-entry hint, body markup, project ring image, buttons Terminé / +10 min / Ouvrir; mock server `src-tauri/tests/notifd.py`); `config.rs`: config file; `shortcut.rs`: Wayland global shortcut through the XDG portal; `autostart.rs`: XDG autostart entry. `ui/`: local setup and quick-add pages.
- Build: `npm install && npm run build` (set `CARGO_BUILD_JOBS=6` on a busy machine).

## ⛔ Interdits

- ⛔ Create a webview in the tray process: WebKit helper processes would stay resident (about 300 MB) after the window closes; windows live in `--ui` processes.
- ⛔ Grant capabilities to the remote Cadence window: it would expose the capture and config commands to the server's page.
- ⛔ Reach a window process any other way than its stdin (`focus`, `goto /route`): the tray owns the `Child`, nothing else may open a second channel.
- ⛔ Resend a capture without its `Idempotency-Key`: it is the uuid in the queue file, so every retry carries the same one.
- ⛔ Write one shared file from both processes: UI processes only add queue files, the tray process only deletes them; `state.json` (seen uids, snoozes) and `notify-icons/` are the tray's alone.
- ⛔ Put server text into a notification body unescaped: the body is markup, a task name with `<` would break or inject it.
- ⛔ Add a fourth notification button: GNOME shows three.
