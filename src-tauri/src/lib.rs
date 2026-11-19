mod documents;
#[cfg(target_os = "macos")]
mod macos_quit;
mod save;
use documents::*;
use std::path::{Path, PathBuf};
use tauri::{RunEvent, WindowEvent};

fn file_args<'a>(
    argv: impl Iterator<Item = String> + 'a,
    cwd: &'a Path,
) -> impl Iterator<Item = PathBuf> + 'a {
    argv.skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(move |a| cwd.join(a))
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
    fn _force_link() -> CFTypeID {
        0
    }
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
    Err(
        "Setting the default handler from inside the app is only supported on macOS right now."
            .into(),
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Err(e) = open_many(app, file_args(argv.into_iter(), Path::new(&_cwd))) {
                eprintln!("Open files: {e}");
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    let app = builder
        .manage(Documents::default())
        .invoke_handler(tauri::generate_handler![
            initial_document,
            decline_assignment,
            open_documents,
            new_document,
            claim_document,
            document_edited,
            document_menu,
            quit_documents,
            unsaved_documents,
            set_as_default_markdown_handler,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            macos_quit::install(app.handle().clone())?;
            if let Err(e) = open_many(
                app.handle(),
                file_args(std::env::args(), &std::env::current_dir()?),
            ) {
                eprintln!("Open files: {e}");
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            if let Err(e) = open_many(
                app,
                urls.into_iter().filter_map(|url| url.to_file_path().ok()),
            ) {
                eprintln!("Open files: {e}");
            }
        }
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::Focused(true),
            ..
        } => focused(app, &label),
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::Destroyed,
            ..
        } => removed(app, &label),
        _ => (),
    });
}
