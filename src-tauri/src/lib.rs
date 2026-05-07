use std::sync::Mutex;
use tauri::{Emitter, Manager, RunEvent, State};

#[derive(Default)]
struct PendingFile(Mutex<Option<String>>);

fn first_file_arg(argv: &[String]) -> Option<String> {
    argv.iter()
        .skip(1)
        .find(|a| !a.starts_with("--") && !a.starts_with('-'))
        .cloned()
}

fn focus_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.unminimize();
    }
}

#[tauri::command]
fn take_pending_file(state: State<'_, PendingFile>) -> Option<String> {
    state.0.lock().ok().and_then(|mut g| g.take())
}

fn deliver(app: &tauri::AppHandle, path: String) {
    let _ = app.emit("open-file", path.clone());
    if let Some(state) = app.try_state::<PendingFile>() {
        if let Ok(mut g) = state.0.lock() {
            *g = Some(path);
        }
    }
}

#[cfg(target_os = "macos")]
mod ls {
    use core_foundation::base::{CFTypeID, OSStatus};
    use core_foundation::string::CFStringRef;

    pub const K_LS_ROLES_ALL: u32 = 0xFFFF_FFFF;

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        pub fn LSSetDefaultRoleHandlerForContentType(
            in_content_type: CFStringRef,
            in_role: u32,
            in_handler_bundle_id: CFStringRef,
        ) -> OSStatus;
    }

    // Suppress unused warning for transitively-needed symbol on some toolchains.
    #[allow(dead_code)]
    fn _force_link() -> CFTypeID { 0 }
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn set_as_default_markdown_handler(app: tauri::AppHandle) -> Result<(), String> {
    use core_foundation::base::TCFType;
    use core_foundation::string::CFString;

    let bundle_id = app.config().identifier.clone();
    // Cover the canonical markdown UTI plus common alternates.
    let utis = [
        "net.daringfireball.markdown",
        "public.markdown",
        "com.gruber.markdown",
    ];
    let mut last_status: i32 = 0;
    for uti in utis {
        let content_type = CFString::new(uti);
        let handler = CFString::new(&bundle_id);
        let status = unsafe {
            ls::LSSetDefaultRoleHandlerForContentType(
                content_type.as_concrete_TypeRef(),
                ls::K_LS_ROLES_ALL,
                handler.as_concrete_TypeRef(),
            )
        };
        if status == 0 {
            return Ok(());
        }
        last_status = status;
    }
    Err(format!(
        "Launch Services declined to set Marky as the default handler (status {last_status})."
    ))
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn set_as_default_markdown_handler(_app: tauri::AppHandle) -> Result<(), String> {
    Err("Setting the default handler from inside the app is only supported on macOS right now.".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            focus_main(app);
            if let Some(path) = first_file_arg(&argv) {
                deliver(app, path);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(PendingFile::default())
        .invoke_handler(tauri::generate_handler![
            take_pending_file,
            set_as_default_markdown_handler,
        ])
        .setup(|app| {
            let argv: Vec<String> = std::env::args().collect();
            if let Some(path) = first_file_arg(&argv) {
                deliver(&app.handle(), path);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        if let RunEvent::Opened { urls } = event {
            if let Some(url) = urls.first() {
                if let Some(path) =
                    url.to_file_path().ok().and_then(|p| p.to_str().map(String::from))
                {
                    focus_main(app);
                    deliver(app, path);
                }
            }
        }
    });
}
