use gtk::prelude::*;
use javascriptcore::ValueExt;
use webkit2gtk::WebViewExt;

// The web UI draws the window controls in its own top bar and marks them with
// `data-desktop-window` (`drag`, `minimize`, `maximize`, `close`). The page
// gets no channel to the app: on a real primary mouse press GTK asks the page,
// in an isolated script world the page's scripts cannot patch, which marked
// element is under the pointer, then acts on the window itself.
const HIT_TEST: &str = r#"(() => {
  const el = document.elementFromPoint(%X%, %Y%);
  const marked = el && el.closest('[data-desktop-window]');
  if (!marked) return '';
  const action = marked.getAttribute('data-desktop-window');
  if (action !== 'drag') return action;
  const control = el.closest('a,button,input,textarea,select,label,[role],[contenteditable],[tabindex]');
  return control && marked.contains(control) && control !== marked ? '' : 'drag';
})()"#;
const WORLD: &str = "cadence-window-controls";
// Themes give `.titlebar` a height, padding and border; this one must take none.
const STYLE: &str = "#cadence-titlebar { min-height: 0; padding: 0; margin: 0; border: 0; box-shadow: none; background: none; }";

pub fn attach(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let gtk_window = window.gtk_window()?;
    // An empty titlebar keeps GTK's client-side frame (shadow, resize edges)
    // without the system bar; the controls live in the web UI's top bar.
    let empty = gtk::Box::new(gtk::Orientation::Horizontal, 0);
    empty.set_widget_name("cadence-titlebar");
    let provider = gtk::CssProvider::new();
    provider.load_from_data(STYLE.as_bytes())?;
    empty
        .style_context()
        .add_provider(&provider, gtk::STYLE_PROVIDER_PRIORITY_APPLICATION);
    gtk_window.set_titlebar(Some(&empty));
    if gtk_window.titlebar().is_none() {
        return Err("failed to replace the system titlebar".into());
    }
    empty.show();

    let target = window.clone();
    window.with_webview(move |platform| {
        let webview = platform.inner();
        webview.connect_button_press_event(move |view, event| {
            if event.button() != 1 {
                return gtk::glib::Propagation::Proceed;
            }
            let double = event.event_type() == gtk::gdk::EventType::DoubleButtonPress;
            let (x, y) = event.position();
            let (root_x, root_y) = event.root();
            let zoom = view.zoom_level().max(0.1);
            let script = HIT_TEST
                .replace("%X%", &format!("{:.1}", x / zoom))
                .replace("%Y%", &format!("{:.1}", y / zoom));
            let time = event.time();
            let target = target.clone();
            view.evaluate_javascript(
                &script,
                Some(WORLD),
                None,
                None::<&webkit2gtk::gio::Cancellable>,
                move |result| {
                    let Ok(value) = result else { return };
                    act(&target, &value.to_str(), double, root_x, root_y, time);
                },
            );
            gtk::glib::Propagation::Proceed
        });
    })?;
    Ok(())
}

fn act(window: &tauri::WebviewWindow, action: &str, double: bool, x: f64, y: f64, time: u32) {
    let toggle_maximize = || {
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    };
    match action {
        "minimize" if !double => {
            let _ = window.minimize();
        }
        "maximize" if !double => toggle_maximize(),
        "close" if !double => {
            let _ = window.close();
        }
        "drag" if double => toggle_maximize(),
        "drag" => {
            if let Ok(gtk_window) = window.gtk_window() {
                gtk_window.begin_move_drag(1, x as i32, y as i32, time);
            }
        }
        _ => {}
    }
}
