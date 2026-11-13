use gtk::prelude::*;
use javascriptcore::ValueExt;
use std::time::Duration;
use webkit2gtk::WebViewExt;

const STYLE: &str = r#"
#cadence-titlebar {
  background: #f4f4f6;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  min-height: 32px;
  padding: 0 7px;
}
#cadence-titlebar button {
  background: transparent;
  border: 0;
  border-radius: 6px;
  box-shadow: none;
  color: #46464f;
  min-height: 28px;
  min-width: 32px;
  padding: 0;
}
#cadence-titlebar button:hover { background: #e4e4e8; }
#cadence-titlebar button:active { background: #d9d9df; }
#cadence-titlebar button:focus { outline: 2px solid #5e5ce6; outline-offset: -2px; }
#cadence-titlebar #cadence-close:hover { background: #f9dfe1; color: #a72f3c; }
#cadence-titlebar.cadence-dark { background: #1f2129; }
#cadence-titlebar.cadence-dark button { color: #ececf2; }
#cadence-titlebar.cadence-dark button:hover { background: #30333f; }
#cadence-titlebar.cadence-dark button:active { background: #414453; }
#cadence-titlebar.cadence-dark button:focus { outline-color: #a9a6ff; }
#cadence-titlebar.cadence-dark #cadence-close:hover { background: #653039; color: #fff; }
"#;

pub fn attach(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let gtk_window = window.gtk_window()?;
    let header = gtk::HeaderBar::new();
    header.set_widget_name("cadence-titlebar");
    header.set_show_close_button(false);

    let minimize = button("window-minimize-symbolic", "Réduire");
    let maximize = button("window-maximize-symbolic", "Agrandir ou restaurer");
    let close = button("window-close-symbolic", "Fermer");
    close.set_widget_name("cadence-close");

    let min_window = window.clone();
    minimize.connect_clicked(move |_| {
        let _ = min_window.minimize();
    });
    let max_window = window.clone();
    maximize.connect_clicked(move |_| {
        if max_window.is_maximized().unwrap_or(false) {
            let _ = max_window.unmaximize();
        } else {
            let _ = max_window.maximize();
        }
    });
    let close_window = window.clone();
    close.connect_clicked(move |_| {
        let _ = close_window.close();
    });

    // GTK places end-packed widgets from the outside in.
    header.pack_end(&close);
    header.pack_end(&maximize);
    header.pack_end(&minimize);

    let provider = gtk::CssProvider::new();
    provider.load_from_data(STYLE.as_bytes())?;
    if let Some(screen) = gtk::gdk::Screen::default() {
        gtk::StyleContext::add_provider_for_screen(
            &screen,
            &provider,
            gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
        );
    }
    gtk_window.set_titlebar(Some(&header));
    if gtk_window.titlebar().is_none() {
        return Err("failed to attach the Cadence titlebar".into());
    }
    header.show_all();
    sync_theme(window)?;
    Ok(())
}

fn sync_theme(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let window_for_webview = window.clone();
    window.with_webview(move |platform| {
        let Ok(gtk_window) = window_for_webview.gtk_window() else {
            return;
        };
        let Some(header) = gtk_window
            .titlebar()
            .and_then(|widget| widget.downcast::<gtk::HeaderBar>().ok())
        else {
            return;
        };
        let webview = platform.inner();
        let weak = webview.downgrade();
        gtk::glib::timeout_add_local(Duration::from_secs(1), move || {
            let Some(webview) = weak.upgrade() else {
                return gtk::glib::ControlFlow::Break;
            };
            let header = header.clone();
            webview.evaluate_javascript(
                "document.documentElement.classList.contains('dark')",
                None,
                None,
                None::<&webkit2gtk::gio::Cancellable>,
                move |result| {
                    if let Ok(value) = result {
                        if value.is_boolean() {
                            let context = header.style_context();
                            if value.to_boolean() {
                                context.add_class("cadence-dark");
                            } else {
                                context.remove_class("cadence-dark");
                            }
                        }
                    }
                },
            );
            gtk::glib::ControlFlow::Continue
        });
    })?;
    Ok(())
}

fn button(icon: &str, label: &str) -> gtk::Button {
    let button = gtk::Button::from_icon_name(Some(icon), gtk::IconSize::Button);
    button.set_tooltip_text(Some(label));
    button.set_can_focus(true);
    button
}
