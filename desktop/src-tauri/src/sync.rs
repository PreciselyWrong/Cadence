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

/// Notification state owned by the tray process alone.
pub struct Store {
    path: PathBuf,
    last_notified: Mutex<Option<String>>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(default)]
struct Persisted {
    /// `created_at` (ISO 8601, sortable as text) of the newest notification already shown.
    last_notified: Option<String>,
}

impl Store {
    pub fn open(path: PathBuf) -> Self {
        let data: Persisted = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();
        Self {
            path,
            last_notified: Mutex::new(data.last_notified),
        }
    }

    fn set_last_notified(&self, value: String) {
        let mut guard = self.last_notified.lock().unwrap();
        *guard = Some(value.clone());
        let json = serde_json::to_vec(&Persisted {
            last_notified: Some(value),
        })
        .unwrap_or_default();
        if let Err(e) = config::write_atomic(&self.path, &json) {
            eprintln!("state not saved: {e}");
        }
    }

    fn last_notified(&self) -> Option<String> {
        self.last_notified.lock().unwrap().clone()
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

#[derive(Deserialize)]
struct ServerNotification {
    title: String,
    message: Option<String>,
    created_at: String,
}

/// Unread, non-dismissed notifications newer than the last one shown, oldest first.
/// The first successful poll only records a baseline, so old unread items do not
/// flood the desktop.
pub fn poll_notifications(store: &Store, cfg: &Config) -> Vec<(String, String)> {
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

    let newest = list.notifications.iter().map(|n| n.created_at.clone()).max();
    let Some(last) = store.last_notified() else {
        store.set_last_notified(newest.unwrap_or_default());
        return Vec::new();
    };

    let mut fresh: Vec<&ServerNotification> = list
        .notifications
        .iter()
        .filter(|n| n.created_at > last)
        .collect();
    fresh.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    if let Some(newest) = newest.filter(|n| *n > last) {
        store.set_last_notified(newest);
    }
    fresh
        .into_iter()
        .map(|n| (n.title.clone(), n.message.clone().unwrap_or_default()))
        .collect()
}
