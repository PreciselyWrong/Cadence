use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub const DEFAULT_SERVER_URL: &str = "http://cadence.lan";
pub const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+Space";
const MIN_POLL_SECONDS: u64 = 15;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Config {
    pub server_url: String,
    /// Cadence API key (`tt_...`). Empty until the user enters it once.
    pub api_token: String,
    pub shortcut: String,
    pub poll_seconds: u64,
    /// Start in the tray at login. The autostart entry is the source of truth: this is
    /// filled from it when the settings page loads and applied to it on save.
    pub autostart: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server_url: DEFAULT_SERVER_URL.into(),
            api_token: String::new(),
            shortcut: DEFAULT_SHORTCUT.into(),
            poll_seconds: 60,
            autostart: false,
        }
    }
}

impl Config {
    /// Normalizes user input and rejects values the app cannot use.
    pub fn normalized(mut self) -> Result<Self, String> {
        self.server_url = self.server_url.trim().trim_end_matches('/').to_string();
        if !(self.server_url.starts_with("http://") || self.server_url.starts_with("https://")) {
            return Err("server_url must start with http:// or https://".into());
        }
        self.api_token = self.api_token.trim().to_string();
        self.shortcut = self.shortcut.trim().to_string();
        if self.shortcut.is_empty() {
            self.shortcut = DEFAULT_SHORTCUT.into();
        }
        self.poll_seconds = self.poll_seconds.max(MIN_POLL_SECONDS);
        Ok(self)
    }
}

/// Reads the config; `None` when the file does not exist yet (first launch).
pub fn load(path: &Path) -> Option<Config> {
    let raw = fs::read_to_string(path).ok()?;
    match serde_json::from_str::<Config>(&raw)
        .map_err(|e| e.to_string())
        .and_then(Config::normalized)
    {
        Ok(cfg) => Some(cfg),
        Err(e) => {
            eprintln!("config unreadable ({e}), using defaults");
            None
        }
    }
}

pub fn save(path: &Path, cfg: &Config) -> Result<(), String> {
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    write_atomic(path, json.as_bytes())
}

/// Writes through a temp file then renames, so a crash never leaves half a file.
/// The file is owner-only: the config holds the API token.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::os::unix::fs::OpenOptionsExt;

    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp: PathBuf = path.with_extension("tmp");
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&tmp)
        .map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}
