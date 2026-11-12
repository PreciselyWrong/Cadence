//! Native notifications on Linux, sent over D-Bus with `notify-rust`. The Tauri plugin sent
//! only a sound hint: KDE then showed the bare executable name and no link to the Cadence
//! app, and there was no button to open the item.
//!
//! Plasma 6 renders the body's `<b>`/`<i>` markup, every action as a button, and an
//! `image-path` as a 48 px picture beside the text; GNOME shows at most three buttons, so
//! a notification never carries more than three.

use crate::sync::{Alert, Details};
use notify_rust::{Hint, Notification, Timeout, Urgency};
use std::{path::Path, path::PathBuf, thread};

/// Desktop file the RPM installs (`ch.nicolab.cadence.desktop.desktop`). The shell uses it
/// to name the app and find its icon, which is why it is sent as a hint.
const DESKTOP_ENTRY: &str = "ch.nicolab.cadence.desktop";
const APP_NAME: &str = "Cadence";
const ICON: &str = "cadence-desktop";
/// Freedesktop `default` is the click on the body; the others are visible buttons.
const DEFAULT_ACTION: &str = "default";
const DONE_ACTION: &str = "done";
const SNOOZE_ACTION: &str = "snooze";
const OPEN_ACTION: &str = "open";
const OPEN_LABEL: &str = "Ouvrir";

/// What the user did with a notification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Choice {
    Open,
    Done,
    Snooze,
}

fn choice(action: &str) -> Option<Choice> {
    match action {
        DEFAULT_ACTION | OPEN_ACTION => Some(Choice::Open),
        DONE_ACTION => Some(Choice::Done),
        SNOOZE_ACTION => Some(Choice::Snooze),
        _ => None,
    }
}

/// Body markup is a subset of HTML: server text must not be read as tags.
fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// `25 min`, `1 h`, `1 h 30`.
fn duration(minutes: u32) -> String {
    match (minutes / 60, minutes % 60) {
        (0, m) => format!("{m} min"),
        (h, 0) => format!("{h} h"),
        (h, m) => format!("{h} h {m:02}"),
    }
}

/// `Rappel · 14:30 · <b>Admin</b> · 25 min`, then the note's first line in italics.
fn body_markup(alert: &Alert) -> String {
    let mut first: Vec<String> = Vec::new();
    if !alert.body.is_empty() {
        first.push(escape(&alert.body));
    }
    let details = alert.details.clone().unwrap_or_default();
    if let Some(time) = &details.time {
        first.push(escape(time));
    }
    if let Some(project) = &details.project {
        first.push(format!("<b>{}</b>", escape(project)));
    }
    if let Some(minutes) = details.minutes {
        first.push(duration(minutes));
    }
    let mut lines = vec![first.join(" · ")];
    if let Some(note) = &details.note {
        lines.push(format!("<i>{}</i>", escape(note)));
    }
    lines.retain(|line| !line.is_empty());
    lines.join("\n")
}

/// A ring in the project's colour, the open checkbox of the task. Written once per colour by
/// the tray process, the only writer of `icon_dir`.
fn project_ring(icon_dir: &Path, details: &Details) -> Option<PathBuf> {
    let color = details.color.as_deref()?;
    let path = icon_dir.join(format!("ring-{}.svg", color.trim_start_matches('#')));
    if !path.exists() {
        let svg = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="36" fill="{color}" fill-opacity="0.18" stroke="{color}" stroke-width="9"/></svg>"#
        );
        if let Err(e) = crate::config::write_atomic(&path, svg.as_bytes()) {
            eprintln!("notification image not written: {e}");
            return None;
        }
    }
    Some(path)
}

fn build(alert: &Alert, image: Option<&Path>) -> Notification {
    let mut notification = Notification::new();
    notification
        .appname(APP_NAME)
        .icon(ICON)
        .hint(Hint::DesktopEntry(DESKTOP_ENTRY.to_string()))
        .urgency(Urgency::Normal)
        .summary(&alert.title)
        .action(DEFAULT_ACTION, OPEN_LABEL);
    let body = body_markup(alert);
    if !body.is_empty() {
        notification.body(&body);
    }
    if let Some(image) = image {
        notification.hint(Hint::ImagePath(format!("file://{}", image.display())));
    }
    if alert.task_uid.is_some() {
        notification.action(DONE_ACTION, "Terminé");
    }
    if alert.snoozable {
        notification.action(SNOOZE_ACTION, "+10 min");
    }
    if alert.path.is_some() {
        notification.action(OPEN_ACTION, OPEN_LABEL);
    }
    if alert.sticky {
        notification.timeout(Timeout::Never);
    }
    notification
}

/// Shows `alert` and returns once it is on the bus. A thread waits for the user's click
/// on the body or on a button, then calls `on_choice`. Waiting is a thread of its own so
/// the caller never blocks.
pub fn show(
    alert: &Alert,
    icon_dir: &Path,
    on_choice: impl FnOnce(Choice) + Send + 'static,
) -> Result<(), String> {
    let image = alert
        .details
        .as_ref()
        .and_then(|details| project_ring(icon_dir, details));
    let handle = build(alert, image.as_deref())
        .show()
        .map_err(|e| e.to_string())?;
    thread::spawn(move || {
        handle.wait_for_action(|action| {
            if let Some(choice) = choice(action) {
                on_choice(choice);
            }
        });
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reminder() -> Alert {
        Alert {
            title: "Appeler la banque".into(),
            body: "Rappel".into(),
            path: Some("/task/abc".into()),
            task_uid: Some("abc".into()),
            snoozable: true,
            sticky: true,
            details: Some(Details {
                time: Some("14:30".into()),
                project: Some("Admin & Co".into()),
                color: Some("#1d4ed8".into()),
                minutes: Some(90),
                note: Some("Relevé <novembre>".into()),
            }),
        }
    }

    #[test]
    fn a_task_reminder_has_three_buttons_and_stays() {
        let n = build(&reminder(), None);
        assert_eq!(
            n.actions,
            ["default", "Ouvrir", "done", "Terminé", "snooze", "+10 min", "open", "Ouvrir"]
        );
        assert_eq!(n.timeout, Timeout::Never);
        assert!(n.hints.contains(&Hint::DesktopEntry(DESKTOP_ENTRY.into())));
    }

    #[test]
    fn the_body_lines_up_time_project_duration_and_note_escaped() {
        assert_eq!(
            body_markup(&reminder()),
            "Rappel · 14:30 · <b>Admin &amp; Co</b> · 1 h 30\n<i>Relevé &lt;novembre&gt;</i>"
        );
    }

    #[test]
    fn a_plain_notification_keeps_its_text_and_only_the_body_click() {
        let alert = Alert {
            title: "New comment".into(),
            body: "Ana <b>wrote</b>".into(),
            ..Alert::default()
        };
        let n = build(&alert, None);
        assert_eq!(n.body, "Ana &lt;b&gt;wrote&lt;/b&gt;");
        assert_eq!(n.actions, ["default", "Ouvrir"]);
        assert_eq!(n.timeout, Timeout::Default);
        assert!(!n.hints.iter().any(|h| matches!(h, Hint::ImagePath(_))));
    }

    #[test]
    fn a_project_colour_becomes_a_ring_image() {
        let dir = std::env::temp_dir().join(format!("cadence-icons-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = project_ring(&dir, reminder().details.as_ref().unwrap()).unwrap();
        assert!(std::fs::read_to_string(&path)
            .unwrap()
            .contains(r##"stroke="#1d4ed8""##));
        let n = build(&reminder(), Some(&path));
        assert!(n
            .hints
            .contains(&Hint::ImagePath(format!("file://{}", path.display()))));
        assert_eq!(project_ring(&dir, &Details::default()), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn durations_read_naturally() {
        assert_eq!(duration(25), "25 min");
        assert_eq!(duration(60), "1 h");
        assert_eq!(duration(95), "1 h 35");
        assert_eq!(duration(65), "1 h 05");
    }

    #[test]
    fn actions_map_to_choices() {
        assert_eq!(choice("default"), Some(Choice::Open));
        assert_eq!(choice("open"), Some(Choice::Open));
        assert_eq!(choice("done"), Some(Choice::Done));
        assert_eq!(choice("snooze"), Some(Choice::Snooze));
        assert_eq!(choice("__closed"), None);
    }

    /// Against a mock `org.freedesktop.Notifications` on a private bus that answers each
    /// notification with `ActionInvoked(<CADENCE_ACTION>)`: the click reaches `on_choice`.
    /// `dbus-run-session -- sh -c 'python3 tests/notifd.py done & sleep 1; CADENCE_ACTION=done
    /// cargo test -- --ignored a_click_reaches_its_choice'`.
    #[test]
    #[ignore = "needs a mock notification server on the session bus"]
    fn a_click_reaches_its_choice() {
        let action = std::env::var("CADENCE_ACTION").expect("CADENCE_ACTION");
        let (tx, rx) = std::sync::mpsc::channel();
        let dir = std::env::temp_dir().join("cadence-click-icons");
        show(&reminder(), &dir, move |choice| tx.send(choice).unwrap()).expect("sent");
        let got = rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("a choice");
        assert_eq!(Some(got), choice(&action));
    }

    /// Sends real notifications on the session bus (run by hand, they pop on the desktop):
    /// `cargo test -- --ignored shows_a_sample_notification --nocapture`.
    #[test]
    #[ignore = "shows real notifications on the desktop"]
    fn shows_a_sample_notification() {
        let dir = std::env::temp_dir().join("cadence-sample-icons");
        let habit = Alert {
            title: "Étirements".into(),
            body: "Habitude".into(),
            snoozable: true,
            ..Alert::default()
        };
        let comment = Alert {
            title: "Nouveau commentaire".into(),
            body: "Ana a commenté « Appeler la banque »".into(),
            path: Some("/task/abc".into()),
            ..Alert::default()
        };
        for alert in [reminder(), habit, comment] {
            let title = alert.title.clone();
            show(&alert, &dir, move |choice| eprintln!("{title}: {choice:?}"))
                .expect("notification sent");
        }
        // Plasma drops the buttons of a notification whose sender left the bus, so the test
        // stays alive long enough to click it.
        thread::sleep(std::time::Duration::from_secs(30));
    }
}
