//! Keeps the main window on the Cadence server. A link to another site opens in the
//! desktop's default app instead of replacing Cadence in the window, and the window tells
//! the web UI it runs in the desktop shell through its user agent.
//!
//! WebKit's `decide-policy` is handled directly rather than through Tauri's `on_navigation`:
//! that callback only gets a URL, so it cannot tell a click on a link (open outside) from an
//! iframe load or a sign-in redirect (stay), and Tauri answers every navigation decision
//! before any later handler runs.

use tauri::Url;

/// Marker the web UI looks for to know it runs inside the desktop app (it then hides its
/// in-app notification bell, native notifications replace it).
const UA_MARKER: &str = "CadenceDesktop/";

/// Schemes the desktop may hand to its default handler. Anything else from the page
/// (`file:`, `javascript:`, custom schemes) is dropped.
const EXTERNAL_SCHEMES: [&str; 4] = ["http", "https", "mailto", "tel"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Navigation {
    /// Same origin as the server (or an empty page): load it in the window.
    Stay,
    /// Another site, or a mail/phone link: the desktop's default app.
    OpenExternal,
    /// A scheme the shell never follows.
    Block,
}

/// Where a URL belongs. Same origin means same scheme, host and port.
pub fn route(url: &Url, server: &Url) -> Navigation {
    if url.scheme() == "about" {
        return if matches!(url.path(), "blank" | "srcdoc") {
            Navigation::Stay
        } else {
            Navigation::Block
        };
    }
    // `blob:` URLs carry the origin of the page that made them (file exports).
    if url.origin().is_tuple() && url.origin() == server.origin() {
        return Navigation::Stay;
    }
    if EXTERNAL_SCHEMES.contains(&url.scheme()) {
        Navigation::OpenExternal
    } else {
        Navigation::Block
    }
}

/// What started a navigation, as WebKit reports it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trigger {
    /// A click on a link, in the page or in one of its frames.
    LinkClick,
    /// A redirect, a script, a form, an iframe load, a reload.
    Other,
    /// `target="_blank"` or `window.open`.
    NewWindow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Allow,
    Ignore,
    OpenExternal,
    /// A new window for the server itself (an attachment download): load it here, a
    /// second window would live in this process unmanaged.
    LoadHere,
}

pub fn decide(url: &Url, server: &Url, trigger: Trigger) -> Action {
    match (route(url, server), trigger) {
        (Navigation::Stay, Trigger::NewWindow) if url.scheme() == "about" => Action::Ignore,
        (Navigation::Stay, Trigger::NewWindow) => Action::LoadHere,
        (Navigation::Stay, _) => Action::Allow,
        (Navigation::Block, _) => Action::Ignore,
        (Navigation::OpenExternal, Trigger::LinkClick | Trigger::NewWindow) => Action::OpenExternal,
        // Not a click: an iframe (the welcome video) or a sign-in through another site
        // (OIDC, Google connect) must stay in the window to work.
        (Navigation::OpenExternal, Trigger::Other) if matches!(url.scheme(), "http" | "https") => {
            Action::Allow
        }
        (Navigation::OpenExternal, Trigger::Other) => Action::OpenExternal,
    }
}

/// WebKit's own user agent with the desktop marker appended once.
pub fn user_agent(default: &str) -> String {
    if default.contains(UA_MARKER) {
        return default.to_string();
    }
    format!(
        "{} {}{}",
        default.trim_end(),
        UA_MARKER,
        env!("CARGO_PKG_VERSION")
    )
}

/// Hands a URL to the desktop's default handler, detached. Only the schemes above pass.
fn open_external(url: &Url) {
    if !EXTERNAL_SCHEMES.contains(&url.scheme()) {
        return;
    }
    match std::process::Command::new("xdg-open")
        .arg(url.as_str())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        // Reaped on a thread so no zombie stays behind.
        Ok(mut child) => {
            std::thread::spawn(move || child.wait());
        }
        Err(error) => eprintln!("cadence: xdg-open failed: {error}"),
    }
}

/// Sets the user agent and the link policy on a window created at `about:blank`, then
/// loads `start`. Starting blank makes both apply from the first Cadence request.
#[cfg(target_os = "linux")]
pub fn attach(window: &tauri::WebviewWindow, server: Url, start: Url) -> tauri::Result<()> {
    use webkit2gtk::{
        glib::{
            gobject_ffi,
            translate::{IntoGlib, ToGlibPtr},
            Cast, StaticType,
        },
        NavigationPolicyDecision, NavigationPolicyDecisionExt, NavigationType, PolicyDecisionExt,
        PolicyDecisionType, SettingsExt, URIRequestExt, WebView, WebViewExt,
    };

    fn perform(view: &WebView, url: &Url, action: Action) {
        match action {
            Action::OpenExternal => open_external(url),
            Action::LoadHere => view.load_uri(url.as_str()),
            Action::Allow | Action::Ignore => {}
        }
    }

    let new_window_server = server.clone();
    window.with_webview(move |platform| {
        let webview = platform.inner();
        if let Some(settings) = WebViewExt::settings(&webview) {
            let default = settings
                .user_agent()
                .map(|s| s.to_string())
                .unwrap_or_default();
            settings.set_user_agent(Some(&user_agent(&default)));
        }

        // Tauri (through wry) answers every navigation decision and stops the signal, so its
        // handler is removed: it only runs plugin navigation hooks, and this window has none.
        unsafe {
            let signal = gobject_ffi::g_signal_lookup(
                c"decide-policy".as_ptr(),
                WebView::static_type().into_glib(),
            );
            let instance: *mut webkit2gtk::ffi::WebKitWebView = webview.to_glib_none().0;
            gobject_ffi::g_signal_handlers_disconnect_matched(
                instance as *mut gobject_ffi::GObject,
                gobject_ffi::G_SIGNAL_MATCH_ID,
                signal,
                0,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            );
        }

        webview.connect_decide_policy(move |view, decision, kind| {
            let new_window = match kind {
                PolicyDecisionType::NavigationAction => false,
                PolicyDecisionType::NewWindowAction => true,
                _ => return false,
            };
            let Some(action) = decision
                .dynamic_cast_ref::<NavigationPolicyDecision>()
                .and_then(|d| d.navigation_action())
            else {
                return false;
            };
            let Some(url) = action
                .request()
                .and_then(|r| r.uri())
                .and_then(|u| Url::parse(&u).ok())
            else {
                decision.ignore();
                return true;
            };
            let trigger = if new_window {
                Trigger::NewWindow
            } else if action.navigation_type() == NavigationType::LinkClicked {
                Trigger::LinkClick
            } else {
                Trigger::Other
            };
            match decide(&url, &server, trigger) {
                Action::Allow => decision.use_(),
                action => {
                    decision.ignore();
                    perform(view, &url, action);
                }
            }
            true
        });

        // `window.open` reaches WebKit's `create` signal without a policy decision first.
        // No widget is returned, so WebKit never opens a second window.
        webview.connect_create(move |view, action| {
            let url = action
                .clone()
                .request()
                .and_then(|r| r.uri())
                .and_then(|u| Url::parse(&u).ok())?;
            perform(
                view,
                &url,
                decide(&url, &new_window_server, Trigger::NewWindow),
            );
            None
        });

        webview.load_uri(start.as_str());
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    fn server() -> Url {
        url("http://cadence.lan:3002/today")
    }

    #[test]
    fn same_origin_stays_including_the_port() {
        assert_eq!(
            route(&url("http://cadence.lan:3002/task/abc"), &server()),
            Navigation::Stay
        );
        assert_eq!(
            route(&url("http://cadence.lan:8080/task/abc"), &server()),
            Navigation::OpenExternal
        );
        let default_port = url("http://cadence.lan");
        assert_eq!(
            route(&url("http://cadence.lan:80/x"), &default_port),
            Navigation::Stay
        );
    }

    #[test]
    fn a_subdomain_or_another_scheme_is_another_site() {
        assert_eq!(
            route(&url("http://www.cadence.lan:3002/"), &server()),
            Navigation::OpenExternal
        );
        assert_eq!(
            route(&url("https://cadence.lan:3002/"), &server()),
            Navigation::OpenExternal
        );
        assert_eq!(
            route(&url("https://github.com/x"), &server()),
            Navigation::OpenExternal
        );
    }

    #[test]
    fn mail_and_phone_open_outside() {
        assert_eq!(
            route(&url("mailto:a@example.com"), &server()),
            Navigation::OpenExternal
        );
        assert_eq!(
            route(&url("tel:+41000000000"), &server()),
            Navigation::OpenExternal
        );
    }

    #[test]
    fn local_and_script_schemes_are_blocked() {
        for blocked in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,hi",
            "steam://run/1",
            "about:config",
        ] {
            assert_eq!(
                route(&url(blocked), &server()),
                Navigation::Block,
                "{blocked}"
            );
        }
    }

    #[test]
    fn empty_pages_and_own_blobs_stay() {
        assert_eq!(route(&url("about:blank"), &server()), Navigation::Stay);
        assert_eq!(route(&url("about:srcdoc"), &server()), Navigation::Stay);
        assert_eq!(
            route(&url("blob:http://cadence.lan:3002/0f8e"), &server()),
            Navigation::Stay
        );
        assert_eq!(
            route(&url("blob:https://evil.example/0f8e"), &server()),
            Navigation::Block
        );
    }

    #[test]
    fn only_clicks_and_new_windows_leave_the_window() {
        let site = url("https://github.com/x");
        assert_eq!(
            decide(&site, &server(), Trigger::LinkClick),
            Action::OpenExternal
        );
        assert_eq!(
            decide(&site, &server(), Trigger::NewWindow),
            Action::OpenExternal
        );
        // An iframe or a sign-in redirect through another site stays.
        assert_eq!(decide(&site, &server(), Trigger::Other), Action::Allow);
        let mail = url("mailto:a@example.com");
        assert_eq!(
            decide(&mail, &server(), Trigger::Other),
            Action::OpenExternal
        );
    }

    #[test]
    fn own_new_windows_load_here() {
        let download = url("http://cadence.lan:3002/api/attachments/a/download");
        assert_eq!(
            decide(&download, &server(), Trigger::NewWindow),
            Action::LoadHere
        );
        assert_eq!(
            decide(&download, &server(), Trigger::LinkClick),
            Action::Allow
        );
        assert_eq!(
            decide(&url("about:blank"), &server(), Trigger::NewWindow),
            Action::Ignore
        );
        assert_eq!(
            decide(&url("javascript:alert(1)"), &server(), Trigger::LinkClick),
            Action::Ignore
        );
    }

    #[test]
    fn the_user_agent_keeps_webkit_and_adds_the_marker_once() {
        let webkit = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
        let ua = user_agent(webkit);
        assert_eq!(
            ua,
            format!("{webkit} CadenceDesktop/{}", env!("CARGO_PKG_VERSION"))
        );
        assert_eq!(user_agent(&ua), ua);
    }
}
