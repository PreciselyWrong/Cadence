#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Cadence desktop shell. One binary, two roles:
//!
//! * the **tray process** (default) owns the tray icon, the global shortcut, the capture
//!   queue flush and the notification polling. It never creates a webview, so it idles at a
//!   few dozen MB;
//! * a **UI process** (`--ui main|quick|settings`) shows one window and exits when it closes.
//!   WebKit keeps its helper processes alive after a window closes, so each window gets its
//!   own process to give the memory back.

mod config;
mod sync;

use config::Config;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime},
};
use sync::Store;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;

const QUICK_FLAG: &str = "--quick";
/// Start in the tray with no window (for autostart).
const BACKGROUND_FLAG: &str = "--background";
const UI_FLAG: &str = "--ui";
const TICK: Duration = Duration::from_secs(2);
const FLUSH_RETRY: Duration = Duration::from_secs(60);

struct Paths {
    config: PathBuf,
    queue: PathBuf,
}

impl Paths {
    fn resolve(app: &tauri::App) -> tauri::Result<Self> {
        Ok(Self {
            config: app.path().app_config_dir()?.join("config.json"),
            queue: app.path().app_data_dir()?.join("queue"),
        })
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.iter().position(|a| a == UI_FLAG) {
        Some(i) => run_ui(args.get(i + 1).cloned().unwrap_or_default()),
        None => run_tray(&args),
    }
}

// ---------------------------------------------------------------- UI process

#[tauri::command]
fn get_config(paths: State<Paths>) -> Config {
    config::load(&paths.config).unwrap_or_default()
}

/// Writes the config and closes the settings window. The tray process notices the file
/// change and applies it (shortcut, server address, first launch of the main window).
#[tauri::command]
fn save_config(app: AppHandle, paths: State<Paths>, config: Config) -> Result<(), String> {
    let config = config.normalized()?;
    config::save(&paths.config, &config)?;
    close(&app, "settings");
    Ok(())
}

/// Stores the capture first, so it survives a missing network, then closes the window.
/// The tray process sends it.
#[tauri::command]
fn capture(app: AppHandle, paths: State<Paths>, text: String) -> Result<(), String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("empty capture".into());
    }
    sync::enqueue(&paths.queue, text.to_string())?;
    close(&app, "quick");
    Ok(())
}

#[tauri::command]
fn close_quick(app: AppHandle) {
    close(&app, "quick");
}

fn close(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    }
}

fn run_ui(kind: String) {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            capture,
            close_quick
        ])
        .setup(move |app| {
            let paths = Paths::resolve(app)?;
            let config = config::load(&paths.config);
            app.manage(paths);
            let handle = app.handle();
            // The Cadence page of the main window talks to the server by itself (session
            // cookie). It is not a local page, so it gets no access to the commands above.
            match (kind.as_str(), config) {
                ("main", Some(config)) => {
                    let url = config.server_url.parse()?;
                    WebviewWindowBuilder::new(handle, "main", WebviewUrl::External(url))
                        .title("Cadence")
                        .inner_size(1280.0, 840.0)
                        .build()?;
                }
                ("quick", _) => {
                    WebviewWindowBuilder::new(handle, "quick", WebviewUrl::App("quick.html".into()))
                        .title("Cadence - Ajout rapide")
                        .inner_size(560.0, 76.0)
                        .decorations(false)
                        .resizable(false)
                        .always_on_top(true)
                        .skip_taskbar(true)
                        .center()
                        .focused(true)
                        .build()?;
                }
                _ => {
                    WebviewWindowBuilder::new(
                        handle,
                        "settings",
                        WebviewUrl::App("setup.html".into()),
                    )
                    .title("Cadence - Réglages")
                    .inner_size(460.0, 560.0)
                    .resizable(false)
                    .build()?;
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run the Cadence UI process");
}

// ------------------------------------------------------------- tray process

struct Tray {
    paths: Paths,
    config: Mutex<Config>,
    store: Store,
    ui: Mutex<HashMap<&'static str, Child>>,
    /// True until a config file exists: saving the first settings opens the main window.
    first_run: Mutex<bool>,
}

impl Tray {
    fn config(&self) -> Config {
        self.config.lock().unwrap().clone()
    }

    fn is_running(&self, kind: &str) -> bool {
        let mut ui = self.ui.lock().unwrap();
        match ui.get_mut(kind) {
            Some(child) => matches!(child.try_wait(), Ok(None)),
            None => false,
        }
    }

    /// Starts a UI process unless one of that kind is already open.
    fn open(&self, kind: &'static str) {
        let kind = if kind == "main" && *self.first_run.lock().unwrap() {
            "settings"
        } else {
            kind
        };
        if self.is_running(kind) {
            return;
        }
        let spawned = std::env::current_exe()
            .and_then(|exe| Command::new(exe).args([UI_FLAG, kind]).spawn());
        match spawned {
            Ok(child) => {
                self.ui.lock().unwrap().insert(kind, child);
            }
            Err(e) => eprintln!("cannot open the {kind} window: {e}"),
        }
    }

    /// Collects exited UI processes so they do not linger as zombies.
    fn reap(&self) {
        for child in self.ui.lock().unwrap().values_mut() {
            let _ = child.try_wait();
        }
    }

    fn close_all(&self) {
        for (_, child) in self.ui.lock().unwrap().iter_mut() {
            let _ = child.kill();
        }
    }
}

fn register_shortcut(app: &AppHandle, shortcut: &str) {
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    if let Err(e) = shortcuts.register(shortcut) {
        eprintln!("global shortcut '{shortcut}' unavailable: {e}");
    }
}

fn modified(path: &Path) -> Option<SystemTime> {
    path.metadata().and_then(|m| m.modified()).ok()
}

/// Applies a config file changed by the settings window.
fn reload_config(app: &AppHandle, tray: &Tray) {
    let Some(new) = config::load(&tray.paths.config) else {
        return;
    };
    let old = tray.config();
    *tray.config.lock().unwrap() = new.clone();
    if new.shortcut != old.shortcut {
        register_shortcut(app, &new.shortcut);
    }
    let first_run = std::mem::replace(&mut *tray.first_run.lock().unwrap(), false);
    if new.server_url != old.server_url && !first_run {
        if let Some(child) = tray.ui.lock().unwrap().get_mut("main") {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    if first_run || new.server_url != old.server_url {
        tray.open("main");
    }
}

/// Every tick: apply config changes and send queued captures. Every `poll_seconds`: show
/// new server notifications. Runs without any window, so it works while the app sits in
/// the tray.
fn background_loop(app: AppHandle) {
    let tray = app.state::<Tray>();
    let mut config_mtime = modified(&tray.paths.config);
    let mut last_attempt = Instant::now() - FLUSH_RETRY;
    let mut last_pending = 0;
    let mut last_poll = Instant::now() - Duration::from_secs(3600);
    loop {
        tray.reap();
        let mtime = modified(&tray.paths.config);
        if mtime != config_mtime {
            config_mtime = mtime;
            reload_config(&app, &tray);
        }
        let config = tray.config();

        let pending = sync::pending(&tray.paths.queue).len();
        if pending > 0 && (pending > last_pending || last_attempt.elapsed() >= FLUSH_RETRY) {
            sync::flush_queue(&tray.paths.queue, &config);
            last_attempt = Instant::now();
            last_pending = sync::pending(&tray.paths.queue).len();
        }

        if last_poll.elapsed() >= Duration::from_secs(config.poll_seconds) {
            last_poll = Instant::now();
            for (title, body) in sync::poll_notifications(&tray.store, &config) {
                let mut notification = app.notification().builder().title(title);
                if !body.is_empty() {
                    notification = notification.body(body);
                }
                if let Err(e) = notification.show() {
                    eprintln!("notification not shown: {e}");
                }
            }
        }
        thread::sleep(TICK);
    }
}

fn run_tray(args: &[String]) {
    let quick_at_start = args.iter().any(|a| a == QUICK_FLAG);
    let background = args.iter().any(|a| a == BACKGROUND_FLAG);
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // `cadence-desktop --quick` is the hook for a desktop-level shortcut (global
            // shortcuts are not available to every Wayland session).
            let tray = app.state::<Tray>();
            if args.iter().any(|a| a == QUICK_FLAG) {
                tray.open("quick");
            } else {
                tray.open("main");
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        app.state::<Tray>().open("quick");
                    }
                })
                .build(),
        )
        .setup(move |app| {
            let paths = Paths::resolve(app)?;
            std::fs::create_dir_all(&paths.queue)?;
            let loaded = config::load(&paths.config);
            let first_run = loaded.is_none();
            let config = loaded.unwrap_or_default();
            let shortcut = config.shortcut.clone();
            let store = Store::open(app.path().app_data_dir()?.join("state.json"));
            app.manage(Tray {
                paths,
                config: Mutex::new(config),
                store,
                ui: Mutex::new(HashMap::new()),
                first_run: Mutex::new(first_run),
            });

            let menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "open", "Ouvrir", true, None::<&str>)?,
                    &MenuItem::with_id(app, "quick", "Ajout rapide", true, None::<&str>)?,
                    &MenuItem::with_id(app, "settings", "Réglages", true, None::<&str>)?,
                    &MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?,
                ],
            )?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().ok_or("missing app icon")?)
                .tooltip("Cadence")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let tray = app.state::<Tray>();
                    match event.id.as_ref() {
                        "open" => tray.open("main"),
                        "quick" => tray.open("quick"),
                        "settings" => tray.open("settings"),
                        "quit" => {
                            tray.close_all();
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            let handle = app.handle().clone();
            register_shortcut(&handle, &shortcut);
            let tray = app.state::<Tray>();
            if quick_at_start {
                tray.open("quick");
            } else if !background || first_run {
                tray.open("main");
            }
            thread::spawn(move || background_loop(handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the Cadence tray process");

    app.run(|app, event| match event {
        // No window ever lives in this process; only "Quitter" ends it.
        RunEvent::ExitRequested { api, code, .. } if code.is_none() => api.prevent_exit(),
        RunEvent::Exit => app.state::<Tray>().close_all(),
        _ => {}
    });
}
