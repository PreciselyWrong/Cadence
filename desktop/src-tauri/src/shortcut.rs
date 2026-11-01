//! Global shortcut under Wayland, through the XDG Desktop Portal `GlobalShortcuts`
//! interface (KDE Plasma 6, GNOME 48+). The X11 grab of the global-shortcut plugin never
//! fires there. The portal owns the binding: the first run asks the user to confirm it and
//! the key can then be changed in the desktop's shortcut settings.

use ashpd::desktop::global_shortcuts::{GlobalShortcuts, NewShortcut};
use futures_lite::StreamExt;

/// Identifier of the quick-add shortcut inside the portal session.
const QUICK_ADD_ID: &str = "quick-add";
/// Desktop file basename the portal maps this process to (host apps register it).
pub const APP_ID: &str = "ch.nicolab.cadence.desktop";

/// True in a Wayland session, where only the portal can deliver global shortcuts.
pub fn is_wayland() -> bool {
    std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t.eq_ignore_ascii_case("wayland"))
        || std::env::var_os("WAYLAND_DISPLAY").is_some_and(|v| !v.is_empty())
}

/// Converts the plugin style (`Ctrl+Alt+Space`) to the portal's shortcut syntax
/// (`CTRL+ALT+space`: upper-case modifiers, XKB key name).
pub fn portal_trigger(shortcut: &str) -> String {
    shortcut
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(|part| match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" | "commandorcontrol" | "cmdorctrl" => "CTRL".to_string(),
            "alt" | "option" => "ALT".to_string(),
            "shift" => "SHIFT".to_string(),
            "super" | "meta" | "logo" | "cmd" | "command" => "LOGO".to_string(),
            key => key.to_string(),
        })
        .collect::<Vec<_>>()
        .join("+")
}

/// Binds the shortcut and blocks, calling `on_activated` for every press.
/// Returns an error when the portal or its GlobalShortcuts interface is unavailable, so the
/// caller can fall back to the X11 grab.
pub fn listen(shortcut: &str, on_activated: impl Fn()) -> Result<(), ashpd::Error> {
    futures_lite::future::block_on(async {
        // Without a registered id the portal cannot name the app (best effort: older portals
        // lack the Registry interface).
        if let Ok(app_id) = ashpd::AppID::try_from(APP_ID) {
            if let Err(e) = ashpd::register_host_app(app_id).await {
                eprintln!("portal app registration skipped: {e}");
            }
        }
        let portal = GlobalShortcuts::new().await?;
        let session = portal.create_session(Default::default()).await?;
        eprintln!("portal shortcut session created, waiting for the desktop to bind it");
        let mut activated = portal.receive_activated().await?;
        let trigger = portal_trigger(shortcut);
        let wanted = NewShortcut::new(QUICK_ADD_ID, "Ouvrir l'ajout rapide Cadence")
            .preferred_trigger(trigger.as_str());
        let bound = portal
            .bind_shortcuts(&session, &[wanted], None, Default::default())
            .await?
            .response()?;
        for s in bound.shortcuts() {
            eprintln!(
                "portal shortcut bound: {} = {}",
                s.id(),
                s.trigger_description()
            );
        }
        while let Some(event) = activated.next().await {
            if event.shortcut_id() == QUICK_ADD_ID {
                on_activated();
            }
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_plugin_shortcuts_to_portal_syntax() {
        assert_eq!(portal_trigger("Ctrl+Alt+Space"), "CTRL+ALT+space");
        assert_eq!(portal_trigger("Super + Shift + N"), "LOGO+SHIFT+n");
        assert_eq!(portal_trigger("CommandOrControl+K"), "CTRL+k");
    }
}
