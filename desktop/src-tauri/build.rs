fn main() {
    // Only the local setup and quick-add pages may call these commands; the
    // Cadence web UI loaded in the main window gets no IPC access.
    let manifest = tauri_build::AppManifest::new().commands(&[
        "get_config",
        "save_config",
        "capture",
        "close_quick",
    ]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest))
        .expect("failed to run tauri-build");
}
