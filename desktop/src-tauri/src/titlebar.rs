use gtk::prelude::*;

const STYLE: &str = r#"
#cadence-titlebar {
  background: #1b2333;
  border: 0;
  border-bottom: 1px solid #334058;
  border-radius: 0;
  box-shadow: none;
  min-height: 42px;
  padding: 0 8px 0 16px;
}
#cadence-titlebar label {
  color: #e9edf5;
  font-size: 13px;
  font-weight: 600;
}
#cadence-titlebar button {
  background: transparent;
  border: 0;
  border-radius: 7px;
  box-shadow: none;
  color: #e9edf5;
  min-height: 30px;
  min-width: 30px;
  padding: 0;
}
#cadence-titlebar button:hover { background: #334058; }
#cadence-titlebar button:active { background: #455574; }
#cadence-titlebar button:focus { outline: 2px solid #a9a6ff; outline-offset: -2px; }
#cadence-titlebar #cadence-close:hover { background: #a73745; }
"#;

pub fn attach(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let gtk_window = window.gtk_window()?;
    let header = gtk::HeaderBar::new();
    header.set_widget_name("cadence-titlebar");
    header.set_show_close_button(false);
    header.set_title(Some("Cadence"));

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
    Ok(())
}

fn button(icon: &str, label: &str) -> gtk::Button {
    let button = gtk::Button::from_icon_name(Some(icon), gtk::IconSize::Button);
    button.set_tooltip_text(Some(label));
    button.set_can_focus(true);
    button
}
