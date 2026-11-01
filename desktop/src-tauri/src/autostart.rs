//! XDG autostart entry (`~/.config/autostart/cadence-desktop.desktop`) toggled from the
//! settings window. The file is the single source of truth: the settings page reads it back.

use crate::config::write_atomic;
use std::path::{Path, PathBuf};

const FILE_NAME: &str = "cadence-desktop.desktop";

pub fn entry_path(config_home: &Path) -> PathBuf {
    config_home.join("autostart").join(FILE_NAME)
}

pub fn is_enabled(config_home: &Path) -> bool {
    entry_path(config_home).is_file()
}

/// Quotes a path for the `Exec` key of a desktop entry.
fn quote(arg: &str) -> String {
    let mut quoted = String::from("\"");
    for c in arg.chars() {
        if matches!(c, '"' | '`' | '$' | '\\') {
            quoted.push('\\');
        }
        quoted.push(c);
    }
    quoted.push('"');
    // `%` is a field code in Exec and doubled inside a quoted string.
    quoted.replace('%', "%%")
}

fn desktop_entry(exe: &Path) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=Cadence\nComment=Cadence desktop client\n\
         Exec={} --background\nIcon=cadence-desktop\nTerminal=false\n\
         X-GNOME-Autostart-enabled=true\n",
        quote(&exe.to_string_lossy())
    )
}

/// The command to put in the entry: the AppImage file when running from one (its mount
/// point disappears on exit), else the running executable.
pub fn launcher() -> std::io::Result<PathBuf> {
    match std::env::var_os("APPIMAGE") {
        Some(appimage) if !appimage.is_empty() => Ok(PathBuf::from(appimage)),
        _ => std::env::current_exe(),
    }
}

pub fn apply(config_home: &Path, exe: &Path, enabled: bool) -> Result<(), String> {
    let path = entry_path(config_home);
    if enabled {
        write_atomic(&path, desktop_entry(exe).as_bytes())
    } else {
        match std::fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_home(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("cadence-autostart-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn writes_and_removes_the_entry() {
        let home = temp_home("toggle");
        let exe = Path::new("/usr/bin/cadence-desktop");
        assert!(!is_enabled(&home));
        apply(&home, exe, true).unwrap();
        assert!(is_enabled(&home));
        let text = std::fs::read_to_string(entry_path(&home)).unwrap();
        assert!(text.contains("Exec=\"/usr/bin/cadence-desktop\" --background\n"));
        apply(&home, exe, false).unwrap();
        assert!(!is_enabled(&home));
        apply(&home, exe, false).unwrap();
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn quotes_paths_with_spaces_and_specials() {
        assert_eq!(
            quote("/opt/My Apps/c.AppImage"),
            "\"/opt/My Apps/c.AppImage\""
        );
        assert_eq!(quote("/a\"b$c"), "\"/a\\\"b\\$c\"");
        assert_eq!(quote("/100%"), "\"/100%%\"");
    }
}
