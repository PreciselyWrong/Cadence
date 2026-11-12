//! Capture queue, inbox flush and notification polling against the Cadence API.
//! Everything here is blocking; callers run it on plain threads.

use crate::config::{self, Config};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

const SOURCE: &str = "desktop";
const NOTIFICATION_PAGE: u32 = 20;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Capture {
    /// Sent as `Idempotency-Key`, so a retry after a lost answer cannot create a second
    /// inbox item. Files written by older versions have none (see [`idempotency_key`]).
    #[serde(default)]
    pub id: String,
    pub content: String,
    /// Unix seconds, for diagnostics only (the inbox has no capture date on create).
    pub captured_at: u64,
}

/// Captures wait on disk, one file each, in `<data>/queue/`. UI processes only ever add files
/// and the tray process only ever deletes them, so the two never write the same file.
pub fn enqueue(queue_dir: &Path, content: String) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let capture = Capture {
        id: uuid::Uuid::new_v4().to_string(),
        content,
        captured_at: now.as_secs(),
    };
    let json = serde_json::to_vec(&capture).map_err(|e| e.to_string())?;
    let name = format!("{:020}-{}.json", now.as_nanos(), std::process::id());
    config::write_atomic(&queue_dir.join(name), &json)
}

/// Queued capture files, oldest first.
pub fn pending(queue_dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(queue_dir)
        .map(|dir| {
            dir.filter_map(Result::ok)
                .map(|entry| entry.path())
                .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
                .collect()
        })
        .unwrap_or_default();
    files.sort();
    files
}

/// Key of one capture, identical on every retry: the capture's own uuid, or for a file from an
/// older version the file name (also fixed for the life of the file).
fn idempotency_key(path: &Path, capture: &Capture) -> String {
    if !capture.id.is_empty() {
        return capture.id.clone();
    }
    path.file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Newest notification uids remembered, so a notification is shown once even when the
/// server keeps listing it as unread.
const SEEN_LIMIT: usize = 500;

/// Notification state owned by the tray process alone.
pub struct Store {
    path: PathBuf,
    state: Mutex<Persisted>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(default)]
struct Persisted {
    /// False until the first successful poll has recorded what already exists.
    baseline_done: bool,
    /// Uids of notifications already shown (or present at the baseline), oldest first.
    seen: Vec<String>,
    /// Alerts put off with "+10 min", shown again once `at` (Unix seconds) has passed.
    snoozed: Vec<Snoozed>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
struct Snoozed {
    at: u64,
    alert: Alert,
}

/// How long "+10 min" puts an alert off.
pub const SNOOZE_SECS: u64 = 600;

pub fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

impl Store {
    pub fn open(path: PathBuf) -> Self {
        let state: Persisted = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();
        Self {
            path,
            state: Mutex::new(state),
        }
    }

    fn save(&self, state: &Persisted) {
        let json = serde_json::to_vec(state).unwrap_or_default();
        if let Err(e) = config::write_atomic(&self.path, &json) {
            eprintln!("state not saved: {e}");
        }
    }

    /// Shows `alert` again at `at` (Unix seconds), even after a restart.
    pub fn snooze(&self, alert: Alert, at: u64) {
        let mut state = self.state.lock().unwrap();
        state.snoozed.push(Snoozed { at, alert });
        self.save(&state);
    }

    /// Snoozed alerts whose time has come, removed from the store. One that came due while
    /// the app was off is shown at the next start.
    pub fn take_due(&self, now: u64) -> Vec<Alert> {
        let mut state = self.state.lock().unwrap();
        if !state.snoozed.iter().any(|s| s.at <= now) {
            return Vec::new();
        }
        let (due, later): (Vec<Snoozed>, Vec<Snoozed>) =
            state.snoozed.drain(..).partition(|s| s.at <= now);
        state.snoozed = later;
        self.save(&state);
        due.into_iter().map(|s| s.alert).collect()
    }
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(10))
        .user_agent("cadence-desktop")
        .build()
}

fn bearer(cfg: &Config) -> String {
    format!("Bearer {}", cfg.api_token)
}

/// Posts queued captures in order. Stops at the first failure a retry could fix
/// (offline, 5xx, auth, rate limit). A capture the server rejects as invalid is
/// dropped so it cannot block the queue forever.
pub fn flush_queue(queue_dir: &Path, cfg: &Config) {
    if cfg.api_token.is_empty() {
        return;
    }
    let agent = agent();
    let url = format!("{}/api/inbox", cfg.server_url);
    for path in pending(queue_dir) {
        let Some(capture) = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Capture>(&raw).ok())
        else {
            eprintln!("unreadable capture file {}, dropped", path.display());
            let _ = std::fs::remove_file(&path);
            continue;
        };
        let result = agent
            .post(&url)
            .set("Authorization", &bearer(cfg))
            .set("Idempotency-Key", &idempotency_key(&path, &capture))
            .send_json(serde_json::json!({ "content": capture.content, "source": SOURCE }));
        match result {
            Ok(_) => {
                let _ = std::fs::remove_file(&path);
            }
            Err(ureq::Error::Status(code, _))
                if (400..500).contains(&code) && !matches!(code, 401 | 403 | 408 | 429) =>
            {
                eprintln!("capture rejected by server (HTTP {code}), dropped");
                let _ = std::fs::remove_file(&path);
            }
            Err(e) => {
                eprintln!("capture flush paused: {e}");
                return;
            }
        }
    }
}

#[derive(Deserialize)]
struct NotificationList {
    notifications: Vec<ServerNotification>,
}

#[derive(Deserialize, Clone, Debug)]
struct ServerNotification {
    uid: String,
    title: String,
    message: Option<String>,
    created_at: String,
    /// Delivery channels the server chose for this notification.
    #[serde(default)]
    sources: Vec<String>,
    /// Quiet hours hold delivery until this UTC instant (ISO 8601).
    #[serde(default)]
    deliver_after: Option<String>,
    /// Free-form payload (`taskUid`, `projectUid`, ...) used to open the related item.
    #[serde(default)]
    data: Option<serde_json::Value>,
    /// `info`, `success`, `warning` or `error`: sets the desktop urgency.
    #[serde(default)]
    level: Option<String>,
}

/// What the desktop shows for one server notification. Kept in `state.json` while snoozed.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(default)]
pub struct Alert {
    pub title: String,
    /// Plain text (a short label for reminders, the server's message otherwise).
    pub body: String,
    /// Web UI path of the related task or project, opened when the notification is clicked.
    pub path: Option<String>,
    /// Task a reminder is about: offers "Terminé", which completes it on the server.
    pub task_uid: Option<String>,
    /// Offers "+10 min", which shows the same alert again later.
    pub snoozable: bool,
    /// A reminder at a fixed time stays on screen until the user acts on it.
    pub sticky: bool,
    /// The task's time, project and note, read from the server when the alert is made.
    pub details: Option<Details>,
    /// Server notification uid, so a read elsewhere can close it.
    pub server_uid: Option<String>,
    /// Name of the agent that wrote it (`Agent` when the plugin gave none).
    pub agent: Option<String>,
    /// Page that opens the message with its reply field focused ("Répondre").
    pub reply: Option<String>,
    /// Server level: `info` (default), `success`, `warning`, `error`.
    pub level: String,
}

/// What a task reminder adds under its title.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(default)]
pub struct Details {
    /// `HH:MM` in the user's time zone.
    pub time: Option<String>,
    pub project: Option<String>,
    /// `#rrggbb`, checked before it reaches a file.
    pub color: Option<String>,
    pub minutes: Option<u32>,
    /// First line of the task's note.
    pub note: Option<String>,
}

/// Longest note line shown in a notification, in characters.
const NOTE_CHARS: usize = 120;

/// `#rrggbb` only: the colour is written into an SVG file.
fn is_hex_color(color: &str) -> bool {
    color.len() == 7 && color.starts_with('#') && color[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Reads the parts of a `GET /api/task/:uid` answer a notification shows.
fn details_from(task: &serde_json::Value) -> Details {
    let text = |value: Option<&serde_json::Value>| {
        value
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    let project = task.get("Project");
    let note = text(task.get("note")).and_then(|note| {
        note.lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(|line| {
                if line.chars().count() > NOTE_CHARS {
                    let cut: String = line.chars().take(NOTE_CHARS - 1).collect();
                    format!("{}…", cut.trim_end())
                } else {
                    line.to_string()
                }
            })
    });
    Details {
        time: text(task.get("due_time")),
        project: text(project.and_then(|p| p.get("name"))),
        color: text(project.and_then(|p| p.get("color"))).filter(|c| is_hex_color(c)),
        minutes: task
            .get("estimated_minutes")
            .and_then(serde_json::Value::as_u64)
            .filter(|m| *m > 0)
            .and_then(|m| u32::try_from(m).ok()),
        note,
    }
}

/// The task a reminder is about, or `None` when the server cannot be read (the reminder
/// is then shown with its label only).
fn fetch_details(cfg: &Config, uid: &str) -> Option<Details> {
    if !is_plain_uid(uid) {
        return None;
    }
    let url = format!("{}/api/task/{uid}", cfg.server_url);
    match agent()
        .get(&url)
        .set("Authorization", &bearer(cfg))
        .call()
        .map_err(|e| e.to_string())
        .and_then(|r| {
            r.into_json::<serde_json::Value>()
                .map_err(|e| e.to_string())
        }) {
        Ok(task) => Some(details_from(&task)),
        Err(e) => {
            eprintln!("task details not read: {e}");
            None
        }
    }
}

/// Marks a task done (`PATCH /api/task/:uid`, status 2, the web app's own call). One key per
/// click, sent again on the single retry after a lost answer, so a recurring task cannot
/// advance twice.
pub fn complete_task(cfg: &Config, uid: &str) -> Result<(), String> {
    if cfg.api_token.is_empty() {
        return Err("no API key".into());
    }
    if !is_plain_uid(uid) {
        return Err("invalid task uid".into());
    }
    let url = format!("{}/api/task/{uid}", cfg.server_url);
    let key = uuid::Uuid::new_v4().to_string();
    let mut last = String::new();
    for _ in 0..2 {
        let sent = agent()
            .request("PATCH", &url)
            .set("Authorization", &bearer(cfg))
            .set("Idempotency-Key", &key)
            .send_json(serde_json::json!({ "status": 2 }));
        match sent {
            Ok(_) => return Ok(()),
            Err(ureq::Error::Status(code, _)) if code < 500 && code != 409 => {
                return Err(format!("HTTP {code}"));
            }
            Err(e) => last = e.to_string(),
        }
    }
    Err(last)
}

/// A uid is interpolated into a URL path, so only plain identifier characters are accepted.
fn is_plain_uid(uid: &str) -> bool {
    !uid.is_empty()
        && uid.len() <= 64
        && uid
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// A path inside the Cadence web UI: starts with a single `/`, no spaces or control
/// characters, so it can only ever navigate the main window within the server.
fn is_app_path(path: &str) -> bool {
    path.starts_with('/')
        && !path.starts_with("//")
        && path.len() <= 300
        && path.chars().all(|c| c.is_ascii_graphic())
}

impl ServerNotification {
    /// Web UI route of the item this notification is about (`/task/<uid>`, `/project/<uid>`).
    fn target_path(&self) -> Option<String> {
        let data = self.data.as_ref()?;
        let uid_of = |key: &str| {
            data.get(key)
                .and_then(serde_json::Value::as_str)
                .filter(|uid| is_plain_uid(uid))
        };
        if let Some(uid) = uid_of("taskUid") {
            Some(format!("/task/{uid}"))
        } else if let Some(uid) = uid_of("projectUid") {
            Some(format!("/project/{uid}"))
        } else {
            // A plugin names the page it wants opened (`/plugins/hermes?msg=...`).
            data.get("openPath")
                .and_then(serde_json::Value::as_str)
                .filter(|path| is_app_path(path))
                .map(str::to_string)
        }
    }

    /// What the desktop shows. The three reminder kinds show the item's name with a short
    /// French label; anything else keeps the server's text. A body that only repeats the
    /// title is dropped.
    fn alert(&self) -> Alert {
        let data = self.data.as_ref();
        let text = |key: &str| {
            data.and_then(|d| d.get(key))
                .and_then(serde_json::Value::as_str)
        };
        let reason = text("reason");
        let reminder = match reason {
            Some("task_reminder") => Some(("taskName", "Rappel")),
            Some("timed_task") => Some(("taskName", "Échéance")),
            Some("habit_reminder") => Some(("habitName", "Habitude")),
            Some("defer_until_reached") => Some(("taskName", "Disponible maintenant")),
            _ => None,
        };
        let named = reminder.and_then(|(name_key, label)| {
            text(name_key)
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(|name| (name.to_string(), label.to_string()))
        });
        // Buttons only on a reminder that kept its item name: the others are not actionable.
        let is_reminder = named.is_some();
        let (title, body) = named.unwrap_or_else(|| {
            let body = self
                .message
                .clone()
                .filter(|message| message.trim() != self.title.trim())
                .unwrap_or_default();
            (self.title.clone(), body)
        });
        let task_uid = data
            .and_then(|d| d.get("taskUid"))
            .and_then(serde_json::Value::as_str)
            .filter(|uid| is_reminder && reason != Some("habit_reminder") && is_plain_uid(uid))
            .map(str::to_string);
        let from_agent = data
            .and_then(|d| d.get("pluginId"))
            .and_then(serde_json::Value::as_str)
            .is_some();
        let path = self.target_path();
        let reply = path
            .as_ref()
            .filter(|_| from_agent && text("replyPath").is_some_and(is_app_path));
        Alert {
            reply: reply.map(|p| format!("{p}{}reply=1", if p.contains('?') { '&' } else { '?' })),
            server_uid: Some(self.uid.clone()),
            agent: from_agent.then(|| {
                text("agentLabel")
                    .map(str::trim)
                    .filter(|l| !l.is_empty())
                    .unwrap_or("Agent")
                    .to_string()
            }),
            level: self.level.clone().unwrap_or_else(|| "info".into()),
            title,
            body,
            path,
            task_uid,
            snoozable: is_reminder,
            sticky: matches!(reason, Some("task_reminder" | "timed_task")) && is_reminder,
            details: None,
        }
    }

    /// Quiet hours are over for this notification (ISO 8601 UTC strings sort as text).
    fn released(&self, now_iso: &str) -> bool {
        self.deliver_after
            .as_deref()
            .map_or(true, |after| after <= now_iso)
    }
}

/// Notifications the desktop must show now: the server routed them to `desktop`, quiet
/// hours are over and they were not shown before. Oldest first.
fn pick_fresh<'a>(
    list: &'a [ServerNotification],
    seen: &[String],
    now_iso: &str,
) -> Vec<&'a ServerNotification> {
    let mut fresh: Vec<&ServerNotification> = list
        .iter()
        .filter(|n| n.sources.iter().any(|s| s == SOURCE))
        .filter(|n| n.released(now_iso))
        .filter(|n| !seen.contains(&n.uid))
        .collect();
    fresh.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    fresh
}

/// `YYYY-MM-DDTHH:MM:SS.000Z` for Unix seconds (civil-from-days, proleptic Gregorian).
fn iso_utc(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.000Z",
        rem / 3_600,
        rem % 3_600 / 60,
        rem % 60
    )
}

fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    iso_utc(secs)
}

/// Holds the server's notification stream open and sends one wake-up on `poke` for every
/// `notification` event, so the poll that follows shows it at once instead of up to
/// `poll_seconds` later. The poll stays the source of truth (baseline, seen uids, quiet
/// hours): the stream only says "look now". Returns when the connection ends or fails; the
/// caller reconnects after a pause.
pub fn watch_stream(cfg: &Config, poke: &std::sync::mpsc::Sender<Live>) -> Result<(), String> {
    use std::io::{BufRead, BufReader};
    if cfg.api_token.is_empty() {
        return Err("no API key".to_string());
    }
    let url = format!("{}/api/notifications/stream", cfg.server_url);
    // The server sends a comment every 25 s: a minute of silence means a dead connection.
    let response = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(60))
        .user_agent("cadence-desktop")
        .build()
        .get(&url)
        .set("Authorization", &bearer(cfg))
        .set("Accept", "text/event-stream")
        .call()
        .map_err(|e| e.to_string())?;
    let mut event = String::new();
    for line in BufReader::new(response.into_reader()).lines() {
        let line = line.map_err(|e| e.to_string())?;
        let line = line.trim_end();
        if let Some(name) = line.strip_prefix("event: ") {
            event = name.to_string();
            if event == "notification" && poke.send(Live::New).is_err() {
                return Ok(());
            }
        } else if let Some(data) = line.strip_prefix("data: ") {
            if event == "notification_read" {
                let uids = serde_json::from_str::<serde_json::Value>(data)
                    .ok()
                    .and_then(|v| v.get("uids").cloned())
                    .and_then(|v| serde_json::from_value::<Vec<String>>(v).ok())
                    .unwrap_or_default();
                if !uids.is_empty() && poke.send(Live::Read(uids)).is_err() {
                    return Ok(());
                }
            }
        } else if line.is_empty() {
            event.clear();
        }
    }
    Ok(())
}

/// What the live stream tells the tray: look for new notifications now, or close the
/// ones read elsewhere (phone, web, the plugin's page).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Live {
    New,
    Read(Vec<String>),
}

/// Unread notifications the server routed to the desktop, shown once each. The first
/// successful poll only records a baseline, so old unread items do not flood the desktop.
pub fn poll_notifications(store: &Store, cfg: &Config) -> Vec<Alert> {
    if cfg.api_token.is_empty() {
        return Vec::new();
    }
    let url = format!(
        "{}/api/notifications?includeRead=false&limit={}",
        cfg.server_url, NOTIFICATION_PAGE
    );
    let list: NotificationList = match agent()
        .get(&url)
        .set("Authorization", &bearer(cfg))
        .call()
        .map_err(|e| e.to_string())
        .and_then(|r| r.into_json().map_err(|e| e.to_string()))
    {
        Ok(list) => list,
        Err(e) => {
            eprintln!("notification poll failed: {e}");
            return Vec::new();
        }
    };

    let now = now_iso();
    let mut state = store.state.lock().unwrap();
    let shown: Vec<Alert>;
    if state.baseline_done {
        let fresh = pick_fresh(&list.notifications, &state.seen, &now);
        shown = fresh.iter().map(|n| n.alert()).collect();
        let uids: Vec<String> = fresh.iter().map(|n| n.uid.clone()).collect();
        state.seen.extend(uids);
    } else {
        // Held notifications stay unseen so they still ring once released.
        let existing: Vec<String> = list
            .notifications
            .iter()
            .filter(|n| n.released(&now))
            .map(|n| n.uid.clone())
            .collect();
        state.seen.extend(existing);
        state.baseline_done = true;
        shown = Vec::new();
    }
    if state.seen.len() > SEEN_LIMIT {
        let excess = state.seen.len() - SEEN_LIMIT;
        state.seen.drain(..excess);
    }
    store.save(&state);
    drop(state);
    let mut shown = shown;
    for alert in &mut shown {
        if let Some(uid) = alert.task_uid.clone() {
            alert.details = fetch_details(cfg, &uid);
        }
    }
    shown
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notification(
        uid: &str,
        sources: &[&str],
        deliver_after: Option<&str>,
    ) -> ServerNotification {
        ServerNotification {
            uid: uid.to_string(),
            title: format!("title {uid}"),
            message: None,
            created_at: format!("2026-11-01T10:00:0{}.000Z", uid.len() % 10),
            sources: sources.iter().map(|s| s.to_string()).collect(),
            deliver_after: deliver_after.map(str::to_string),
            data: None,
            level: None,
        }
    }

    fn agent_note(level: &str, data: serde_json::Value) -> ServerNotification {
        ServerNotification {
            title: "3 mails attendent une décision".into(),
            message: Some("Orange attend un paiement".into()),
            level: Some(level.into()),
            data: Some(data),
            ..notification("n1", &["desktop"], None)
        }
    }

    #[test]
    fn an_agent_message_names_its_agent_and_offers_a_reply() {
        let alert = agent_note(
            "warning",
            serde_json::json!({
                "pluginId": "hermes", "agentLabel": "Trieur",
                "openPath": "/plugins/hermes?msg=m1",
                "replyPath": "/plugins/hermes/x/inbox/m1/reply"
            }),
        )
        .alert();
        assert_eq!(alert.agent.as_deref(), Some("Trieur"));
        assert_eq!(alert.path.as_deref(), Some("/plugins/hermes?msg=m1"));
        assert_eq!(
            alert.reply.as_deref(),
            Some("/plugins/hermes?msg=m1&reply=1")
        );
        assert_eq!(alert.server_uid.as_deref(), Some("n1"));
        assert_eq!(alert.level, "warning");
    }

    #[test]
    fn an_agent_without_label_is_agent_and_no_reply_without_a_reply_path() {
        let alert = agent_note(
            "info",
            serde_json::json!({ "pluginId": "hermes", "openPath": "/plugins/hermes?msg=m1" }),
        )
        .alert();
        assert_eq!(alert.agent.as_deref(), Some("Agent"));
        assert_eq!(alert.reply, None);
        let plain = notification("p", &["desktop"], None).alert();
        assert_eq!(plain.agent, None);
        assert_eq!(plain.level, "info");
    }

    const NOW: &str = "2026-11-01T12:00:00.000Z";

    fn uids(list: Vec<&ServerNotification>) -> Vec<String> {
        list.into_iter().map(|n| n.uid.clone()).collect()
    }

    #[test]
    fn shows_only_notifications_routed_to_desktop() {
        let list = vec![
            notification("a", &["desktop"], None),
            notification("bb", &["push"], None),
            notification("ccc", &[], None),
            notification("dddd", &["push", "desktop"], None),
        ];
        assert_eq!(uids(pick_fresh(&list, &[], NOW)), vec!["a", "dddd"]);
    }

    #[test]
    fn never_shows_the_same_uid_twice() {
        let list = vec![
            notification("a", &["desktop"], None),
            notification("bb", &["desktop"], None),
        ];
        let seen = vec!["a".to_string()];
        assert_eq!(uids(pick_fresh(&list, &seen, NOW)), vec!["bb"]);
    }

    #[test]
    fn holds_notifications_until_quiet_hours_end() {
        let list = vec![
            notification("a", &["desktop"], Some("2026-11-01T22:00:00.000Z")),
            notification("bb", &["desktop"], Some("2026-11-01T12:00:00.000Z")),
            notification("ccc", &["desktop"], Some("2026-11-01T07:00:00.000Z")),
        ];
        assert_eq!(uids(pick_fresh(&list, &[], NOW)), vec!["bb", "ccc"]);
        assert_eq!(
            uids(pick_fresh(&list, &[], "2026-11-01T22:00:01.000Z")).len(),
            3
        );
    }

    #[test]
    fn formats_unix_seconds_as_server_style_iso() {
        assert_eq!(iso_utc(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_utc(1_000_000_000), "2001-09-09T01:46:40.000Z");
        assert_eq!(iso_utc(1_782_864_000), "2026-07-01T00:00:00.000Z");
    }

    #[test]
    fn iso_strings_order_like_instants() {
        assert!(iso_utc(1_000_000_000) < iso_utc(1_000_000_001));
        assert!("2026-11-01T07:00:00.000Z" <= NOW);
    }

    #[test]
    fn store_remembers_seen_uids_across_restarts() {
        let path = std::env::temp_dir().join(format!("cadence-state-{}.json", std::process::id()));
        let _ = std::fs::remove_file(&path);
        {
            let store = Store::open(path.clone());
            let mut state = store.state.lock().unwrap();
            state.baseline_done = true;
            state.seen.push("a".to_string());
            store.save(&state);
        }
        let reopened = Store::open(path.clone());
        let state = reopened.state.lock().unwrap();
        assert!(state.baseline_done);
        assert_eq!(state.seen, vec!["a".to_string()]);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn opens_the_task_or_project_a_notification_is_about() {
        let with = |data: serde_json::Value| ServerNotification {
            data: Some(data),
            ..notification("a", &["desktop"], None)
        };
        assert_eq!(
            with(serde_json::json!({ "taskUid": "abc-123_X", "projectUid": "p1" })).target_path(),
            Some("/task/abc-123_X".to_string())
        );
        assert_eq!(
            with(serde_json::json!({ "projectUid": "p1" })).target_path(),
            Some("/project/p1".to_string())
        );
        assert_eq!(
            with(serde_json::json!({ "reason": "x" })).target_path(),
            None
        );
        assert_eq!(notification("a", &[], None).target_path(), None);
    }

    fn with_data(
        title: &str,
        message: Option<&str>,
        data: serde_json::Value,
    ) -> ServerNotification {
        ServerNotification {
            title: title.to_string(),
            message: message.map(str::to_string),
            data: Some(data),
            ..notification("a", &["desktop"], None)
        }
    }

    #[test]
    fn task_reminder_shows_the_task_name_and_a_short_label() {
        let alert = with_data(
            "Task reminder",
            Some("Reminder: \"Buy bread\""),
            serde_json::json!({ "reason": "task_reminder", "taskUid": "abc", "taskName": "Buy bread" }),
        )
        .alert();
        assert_eq!(alert.title, "Buy bread");
        assert_eq!(alert.body, "Rappel");
        assert_eq!(alert.path.as_deref(), Some("/task/abc"));
    }

    #[test]
    fn habit_reminder_shows_the_habit_name_and_a_short_label() {
        let alert = with_data(
            "Habit reminder",
            Some("Time for your habit"),
            serde_json::json!({ "reason": "habit_reminder", "habitUid": "h1", "habitName": "Stretch", "date": "2026-11-12" }),
        )
        .alert();
        assert_eq!(alert.title, "Stretch");
        assert_eq!(alert.body, "Habitude");
    }

    #[test]
    fn deferred_task_shows_its_name_and_availability() {
        let alert = with_data(
            "Task available",
            Some("Deferred task is now available"),
            serde_json::json!({ "reason": "defer_until_reached", "taskUid": "t9", "taskName": "Call the bank", "deferUntil": "2026-11-12" }),
        )
        .alert();
        assert_eq!(alert.title, "Call the bank");
        assert_eq!(alert.body, "Disponible maintenant");
        assert_eq!(alert.path.as_deref(), Some("/task/t9"));
    }

    #[test]
    fn names_are_trimmed() {
        let alert = with_data(
            "Task reminder",
            None,
            serde_json::json!({ "reason": "task_reminder", "taskName": "  Buy bread \n" }),
        )
        .alert();
        assert_eq!(alert.title, "Buy bread");
    }

    #[test]
    fn a_blank_or_missing_name_keeps_the_server_text() {
        let blank = with_data(
            "Task reminder",
            Some("Reminder: \"\""),
            serde_json::json!({ "reason": "task_reminder", "taskName": "   " }),
        )
        .alert();
        assert_eq!(blank.title, "Task reminder");
        assert_eq!(blank.body, "Reminder: \"\"");

        let missing = with_data(
            "Task reminder",
            Some("Reminder: \"x\""),
            serde_json::json!({ "reason": "task_reminder" }),
        )
        .alert();
        assert_eq!(missing.title, "Task reminder");
        assert_eq!(missing.body, "Reminder: \"x\"");
    }

    #[test]
    fn other_notifications_keep_the_server_title_and_message() {
        let alert = with_data(
            "New comment",
            Some("Ana commented on your task"),
            serde_json::json!({ "reason": "comment", "taskUid": "t1", "taskName": "Ignored" }),
        )
        .alert();
        assert_eq!(alert.title, "New comment");
        assert_eq!(alert.body, "Ana commented on your task");
        assert_eq!(alert.path.as_deref(), Some("/task/t1"));
    }

    #[test]
    fn a_body_repeating_the_title_is_dropped() {
        let alert = with_data("Welcome", Some("Welcome"), serde_json::json!({})).alert();
        assert_eq!(alert.title, "Welcome");
        assert_eq!(alert.body, "");
    }

    #[test]
    fn refuses_uids_that_could_escape_the_route() {
        let hostile = ServerNotification {
            data: Some(serde_json::json!({ "taskUid": "../../logout?x=1" })),
            ..notification("a", &["desktop"], None)
        };
        assert_eq!(hostile.target_path(), None);
    }

    /// Serves `answers` (one status line per connection) and returns every request's headers.
    fn serve(answers: Vec<&'static str>) -> (String, std::thread::JoinHandle<Vec<String>>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let handle = std::thread::spawn(move || {
            let mut seen = Vec::new();
            for status in answers {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = Vec::new();
                let mut chunk = [0u8; 1024];
                // Read the whole request (headers, then the declared body) before answering.
                loop {
                    let n = stream.read(&mut chunk).unwrap();
                    request.extend_from_slice(&chunk[..n]);
                    let text = String::from_utf8_lossy(&request).to_lowercase();
                    if let Some((head, body)) = text.split_once("\r\n\r\n") {
                        let wanted = header(head, "content-length")
                            .and_then(|v| v.parse::<usize>().ok())
                            .unwrap_or(0);
                        if body.len() >= wanted || n == 0 {
                            break;
                        }
                    } else if n == 0 {
                        break;
                    }
                }
                seen.push(String::from_utf8_lossy(&request).to_lowercase());
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}"
                )
                .unwrap();
            }
            seen
        });
        (url, handle)
    }

    fn header(request: &str, name: &str) -> Option<String> {
        request
            .lines()
            .find_map(|line| line.strip_prefix(&format!("{name}: ")))
            .map(str::to_string)
    }

    #[test]
    fn retry_after_a_failed_post_carries_the_same_idempotency_key() {
        let (url, server) = serve(vec!["500 Internal Server Error", "201 Created"]);
        let dir = std::env::temp_dir().join(format!("cadence-queue-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let cfg = Config {
            server_url: url,
            api_token: "tt_test".into(),
            ..Config::default()
        };
        enqueue(&dir, "buy milk".into()).unwrap();

        flush_queue(&dir, &cfg);
        assert_eq!(pending(&dir).len(), 1, "a 500 keeps the capture queued");
        flush_queue(&dir, &cfg);
        assert!(pending(&dir).is_empty());

        let requests = server.join().unwrap();
        let first = header(&requests[0], "idempotency-key").expect("key on the first attempt");
        let second = header(&requests[1], "idempotency-key").expect("key on the retry");
        assert_eq!(first, second);
        assert_eq!(first.len(), 36, "uuid v4");
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn token_cfg(url: String) -> Config {
        Config {
            server_url: url,
            api_token: "tt_test".into(),
            ..Config::default()
        }
    }

    #[test]
    fn done_patches_the_task_and_retries_with_the_same_key() {
        let (url, server) = serve(vec!["502 Bad Gateway", "200 OK"]);
        complete_task(&token_cfg(url), "abc-1").expect("completed on the retry");
        let requests = server.join().unwrap();
        for request in &requests {
            assert!(
                request.starts_with("patch /api/task/abc-1 http/1.1"),
                "{request}"
            );
            assert_eq!(
                header(request, "authorization").as_deref(),
                Some("bearer tt_test")
            );
            assert!(request.ends_with(r#"{"status":2}"#), "{request}");
        }
        let first = header(&requests[0], "idempotency-key").expect("key");
        assert_eq!(header(&requests[1], "idempotency-key"), Some(first.clone()));
        assert_eq!(first.len(), 36);
    }

    #[test]
    fn done_gives_up_on_a_client_error_without_retrying() {
        let (url, server) = serve(vec!["404 Not Found"]);
        assert_eq!(
            complete_task(&token_cfg(url), "gone"),
            Err("HTTP 404".into())
        );
        assert_eq!(server.join().unwrap().len(), 1);
    }

    #[test]
    fn done_refuses_a_uid_that_could_escape_the_route() {
        let cfg = token_cfg("http://127.0.0.1:9".into());
        assert!(complete_task(&cfg, "../logout").is_err());
    }

    #[test]
    fn task_reminders_offer_done_snooze_and_stay_on_screen() {
        for reason in ["task_reminder", "timed_task"] {
            let alert = with_data(
                "Task reminder",
                None,
                serde_json::json!({ "reason": reason, "taskUid": "t1", "taskName": "Pay rent" }),
            )
            .alert();
            assert_eq!(alert.task_uid.as_deref(), Some("t1"), "{reason}");
            assert!(alert.snoozable && alert.sticky, "{reason}");
        }
        let timed = with_data(
            "Task reminder",
            None,
            serde_json::json!({ "reason": "timed_task", "taskUid": "t1", "taskName": "Pay rent" }),
        )
        .alert();
        assert_eq!(
            (timed.title.as_str(), timed.body.as_str()),
            ("Pay rent", "Échéance")
        );
    }

    #[test]
    fn habits_snooze_without_done_and_others_get_no_buttons() {
        let habit = with_data(
            "Habit reminder",
            None,
            serde_json::json!({ "reason": "habit_reminder", "habitName": "Stretch", "taskUid": "x" }),
        )
        .alert();
        assert_eq!(habit.task_uid, None);
        assert!(habit.snoozable && !habit.sticky);

        let comment = with_data(
            "New comment",
            Some("Ana commented"),
            serde_json::json!({ "reason": "comment", "taskUid": "t1" }),
        )
        .alert();
        assert_eq!(comment.task_uid, None);
        assert!(!comment.snoozable && !comment.sticky);
    }

    #[test]
    fn details_read_time_project_duration_and_the_first_note_line() {
        let details = details_from(&serde_json::json!({
            "due_time": "14:30",
            "estimated_minutes": 25,
            "note": "\n  Ask for the November statement  \nsecond line",
            "Project": { "name": "Admin", "color": "#1d4ed8" },
        }));
        assert_eq!(
            details,
            Details {
                time: Some("14:30".into()),
                project: Some("Admin".into()),
                color: Some("#1d4ed8".into()),
                minutes: Some(25),
                note: Some("Ask for the November statement".into()),
            }
        );
        assert_eq!(details_from(&serde_json::json!({})), Details::default());
    }

    #[test]
    fn details_drop_odd_colours_and_shorten_long_notes() {
        let details = details_from(&serde_json::json!({
            "note": "x".repeat(300),
            "estimated_minutes": 0,
            "Project": { "name": "P", "color": "red\"/><script>" },
        }));
        assert_eq!(details.color, None);
        assert_eq!(details.minutes, None);
        let note = details.note.unwrap();
        assert_eq!(note.chars().count(), NOTE_CHARS);
        assert!(note.ends_with('…'));
    }

    #[test]
    fn snoozed_alerts_come_back_once_due_even_after_a_restart() {
        let path = std::env::temp_dir().join(format!("cadence-snooze-{}.json", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let alert = Alert {
            title: "Pay rent".into(),
            task_uid: Some("t1".into()),
            snoozable: true,
            ..Alert::default()
        };
        Store::open(path.clone()).snooze(alert.clone(), 1_000);
        let store = Store::open(path.clone());
        assert!(store.take_due(999).is_empty());
        assert_eq!(store.take_due(1_000), vec![alert]);
        assert!(
            Store::open(path.clone()).take_due(5_000).is_empty(),
            "shown once"
        );
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn distinct_captures_get_distinct_keys_and_legacy_files_a_stable_one() {
        let dir = std::env::temp_dir().join(format!("cadence-keys-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        enqueue(&dir, "a".into()).unwrap();
        enqueue(&dir, "b".into()).unwrap();
        let read = |p: &Path| {
            serde_json::from_str::<Capture>(&std::fs::read_to_string(p).unwrap()).unwrap()
        };
        let files = pending(&dir);
        let keys: Vec<String> = files.iter().map(|p| idempotency_key(p, &read(p))).collect();
        assert_ne!(keys[0], keys[1]);

        let legacy = Capture {
            id: String::new(),
            content: "old".into(),
            captured_at: 1,
        };
        let path = dir.join("00000000000000000001-42.json");
        assert_eq!(idempotency_key(&path, &legacy), "00000000000000000001-42");
        assert_eq!(
            idempotency_key(&path, &legacy),
            idempotency_key(&path, &legacy)
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn opens_a_path_a_plugin_notification_names() {
        let with = |data: serde_json::Value| ServerNotification {
            data: Some(data),
            ..notification("a", &["desktop"], None)
        };
        assert_eq!(
            with(serde_json::json!({ "openPath": "/plugins/hermes?msg=m1" })).target_path(),
            Some("/plugins/hermes?msg=m1".to_string())
        );
        for bad in [
            "https://evil.example/x",
            "//evil.example/x",
            "plugins/x",
            "/a b",
            "/a\nb",
        ] {
            assert_eq!(
                with(serde_json::json!({ "openPath": bad })).target_path(),
                None,
                "{bad}"
            );
        }
        // An item the notification is about wins over a path.
        assert_eq!(
            with(serde_json::json!({ "taskUid": "t1", "openPath": "/plugins/x" })).target_path(),
            Some("/task/t1".to_string())
        );
    }

    #[test]
    fn a_stream_event_wakes_the_poll_once_per_notification() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0u8; 2048];
            let n = stream.read(&mut request).unwrap();
            let body = "retry: 5000\nevent: ready\ndata: {}\n\n\
                : ping\n\n\
                event: notification\nid: a\ndata: {\"uid\":\"a\"}\n\n\
                event: notification_read\ndata: {\"uids\":[\"x\",\"y\"]}\n\n\
                event: notification\nid: b\ndata: {\"uid\":\"b\"}\n\n";
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n{body}"
            )
            .unwrap();
            String::from_utf8_lossy(&request[..n]).to_lowercase()
        });
        let (tx, rx) = std::sync::mpsc::channel();
        // The server closes after its events: the call returns instead of hanging.
        let outcome = watch_stream(&token_cfg(url), &tx);
        assert!(outcome.is_ok(), "{outcome:?}");
        assert_eq!(
            rx.try_iter().collect::<Vec<_>>(),
            vec![
                Live::New,
                Live::Read(vec!["x".into(), "y".into()]),
                Live::New
            ]
        );
        let request = server.join().unwrap();
        assert!(request.starts_with("get /api/notifications/stream "));
        assert!(
            request.contains("authorization: bearer tt_test"),
            "{request}"
        );
        assert!(request.contains("accept: text/event-stream"));
    }

    #[test]
    fn the_stream_needs_a_token_and_a_reachable_server() {
        let (tx, _rx) = std::sync::mpsc::channel();
        let mut cfg = token_cfg("http://127.0.0.1:9".into());
        assert!(watch_stream(&cfg, &tx).is_err());
        cfg.api_token = String::new();
        assert_eq!(watch_stream(&cfg, &tx), Err("no API key".to_string()));
    }
}
