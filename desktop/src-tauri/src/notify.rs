//! Native notifications on Linux, sent over D-Bus with `notify-rust`. The Tauri plugin sent
//! only a sound hint: KDE then showed the bare executable name and no link to the Cadence
//! app, and there was no button to open the item.

use crate::sync::Alert;
use notify_rust::{Hint, Notification, Urgency};
use std::thread;

/// Desktop file the RPM installs (`ch.nicolab.cadence.desktop.desktop`). The shell uses it
/// to name the app and find its icon, which is why it is sent as a hint.
const DESKTOP_ENTRY: &str = "ch.nicolab.cadence.desktop";
const APP_NAME: &str = "Cadence";
const ICON: &str = "cadence-desktop";
/// Freedesktop `default` is the click on the body; `open` is the visible button.
const DEFAULT_ACTION: &str = "default";
const OPEN_ACTION: &str = "open";
const OPEN_LABEL: &str = "Ouvrir";

/// Shows `alert` and returns once it is on the bus. A thread waits for the user's click
/// on the body or on the button, then calls `on_open` with the alert's web route (`None`
/// opens the home page). Waiting is a thread of its own so the caller never blocks.
pub fn show(
    alert: Alert,
    on_open: impl FnOnce(Option<&str>) + Send + 'static,
) -> Result<(), String> {
    let mut notification = Notification::new();
    notification
        .appname(APP_NAME)
        .icon(ICON)
        .hint(Hint::DesktopEntry(DESKTOP_ENTRY.to_string()))
        .urgency(Urgency::Normal)
        .summary(&alert.title)
        .action(DEFAULT_ACTION, OPEN_LABEL);
    if !alert.body.is_empty() {
        notification.body(&alert.body);
    }
    if alert.path.is_some() {
        notification.action(OPEN_ACTION, OPEN_LABEL);
    }
    let handle = notification.show().map_err(|e| e.to_string())?;
    let path = alert.path;
    thread::spawn(move || {
        handle.wait_for_action(|action| {
            if action == DEFAULT_ACTION || action == OPEN_ACTION {
                on_open(path.as_deref());
            }
        });
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Sends one real notification on the session bus (run by hand, it pops on the desktop):
    /// `cargo test -- --ignored shows_a_sample_notification`.
    #[test]
    #[ignore = "shows a real notification on the desktop"]
    fn shows_a_sample_notification() {
        show(
            Alert {
                title: "Acheter du pain".to_string(),
                body: "Rappel".to_string(),
                path: Some("/task/abc".to_string()),
            },
            |path| eprintln!("opened {path:?}"),
        )
        .expect("notification sent");
        // Plasma drops the buttons of a notification whose sender left the bus, so the test
        // stays alive long enough to click it.
        thread::sleep(std::time::Duration::from_secs(20));
    }
}
