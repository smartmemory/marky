use std::{
    collections::{BTreeSet, HashMap},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{menu::Menu, AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

#[derive(Default)]
struct Document {
    path: Option<PathBuf>,
    ready: bool,
    dirty: bool,
    menu: Option<Menu<tauri::Wry>>,
}

pub struct Documents(Mutex<Registry>);

#[derive(Default)]
struct Registry {
    windows: HashMap<String, Document>,
    next: usize,
    quit_prompt: bool,
}

// Launch Services may send Opened before Tauri constructs its configured
// main window. Reserve that window from process start, exactly once.
impl Default for Documents {
    fn default() -> Self {
        let mut registry = Registry::default();
        registry.windows.insert("main".into(), Document::default());
        Self(Mutex::new(registry))
    }
}

impl Registry {
    fn dirty_documents(&self) -> BTreeSet<(String, String)> {
        self.windows
            .iter()
            .filter(|(_, doc)| doc.dirty)
            .map(|(label, doc)| {
                let name = doc
                    .path
                    .as_ref()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|| format!("Untitled ({label})"));
                (label.clone(), name)
            })
            .collect()
    }
}

fn identity(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return path.canonicalize().map_err(|e| e.to_string());
    }
    let parent = path.parent().ok_or("Missing parent directory")?;
    Ok(parent
        .canonicalize()
        .map_err(|e| e.to_string())?
        .join(path.file_name().ok_or("Missing file name")?))
}

fn focus(app: &AppHandle, label: &str) {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn open_one(app: &AppHandle, path: Option<PathBuf>, reuse: bool) -> Result<(), String> {
    let path = path.as_deref().map(identity).transpose()?;
    let state = app.state::<Documents>();
    let mut registry = state.0.lock().unwrap();
    if let Some((label, _)) = registry
        .windows
        .iter()
        .find(|(_, d)| path.is_some() && d.path == path)
    {
        let label = label.clone();
        drop(registry);
        focus(app, &label);
        return Ok(());
    }
    if path.is_some() && reuse {
        let candidate = registry
            .windows
            .iter()
            .find(|(_, d)| d.path.is_none() && !d.dirty);
        if let Some((label, doc)) = candidate {
            let label = label.clone();
            let ready = doc.ready;
            registry.windows.get_mut(&label).unwrap().path = path.clone();
            drop(registry);
            if ready {
                if let Err(e) =
                    app.emit_to(label.as_str(), "assigned-document", path.as_ref().unwrap())
                {
                    if let Some(doc) = state.0.lock().unwrap().windows.get_mut(&label) {
                        doc.path = None;
                    }
                    return Err(e.to_string());
                }
                focus(app, &label);
            }
            return Ok(());
        }
    }
    registry.next += 1;
    let label = format!("doc-{}", registry.next);
    registry.windows.insert(
        label.clone(),
        Document {
            path,
            ..Default::default()
        },
    );
    drop(registry);
    let mut config = app.config().app.windows[0].clone();
    config.label = label.clone();
    if let Err(e) = WebviewWindowBuilder::from_config(app, &config).and_then(|b| b.build()) {
        state.0.lock().unwrap().windows.remove(&label);
        return Err(e.to_string());
    }
    Ok(())
}

pub fn open_many(app: &AppHandle, paths: impl Iterator<Item = PathBuf>) -> Result<(), String> {
    let errors: Vec<_> = paths
        .filter_map(|p| open_one(app, Some(p), true).err())
        .collect();
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("\n"))
    }
}

#[tauri::command]
pub async fn open_documents(app: AppHandle, paths: Vec<PathBuf>) -> Result<(), String> {
    open_many(&app, paths.into_iter())
}

// A keystroke may have arrived before its dirty notification crossed IPC.
#[tauri::command]
pub async fn decline_assignment(window: WebviewWindow, path: PathBuf) -> Result<(), String> {
    {
        let state = window.state::<Documents>();
        let mut registry = state.0.lock().unwrap();
        if let Some(doc) = registry.windows.get_mut(window.label()) {
            if doc.path.as_ref() == Some(&path) {
                doc.path = None;
            }
        }
    }
    open_one(window.app_handle(), Some(path), false)
}

#[tauri::command]
pub async fn new_document(app: AppHandle) -> Result<(), String> {
    open_one(&app, None, false)
}

#[tauri::command]
pub fn initial_document(window: WebviewWindow, last: Option<PathBuf>) -> Option<PathBuf> {
    let state = window.state::<Documents>();
    let mut registry = state.0.lock().unwrap();
    let only_window = registry.windows.len() == 1;
    let document = registry.windows.entry(window.label().into()).or_default();
    if only_window && !document.ready && window.label() == "main" && document.path.is_none() {
        document.path = last.filter(|p| p.is_file()).and_then(|p| identity(&p).ok());
    }
    document.ready = true;
    document.path.clone()
}

// A link/history traversal and Save As can change which file a window owns.
#[tauri::command]
pub fn claim_document(
    window: WebviewWindow,
    path: Option<PathBuf>,
    contents: Option<String>,
) -> Result<bool, String> {
    let path = path.as_deref().map(identity).transpose()?;
    let state = window.state::<Documents>();
    let mut registry = state.0.lock().unwrap();
    if let Some((other, _)) = registry
        .windows
        .iter()
        .find(|(label, d)| label.as_str() != window.label() && path.is_some() && d.path == path)
    {
        let other = other.clone();
        drop(registry);
        focus(window.app_handle(), &other);
        return Ok(false);
    }
    if let (Some(p), Some(text)) = (&path, contents) {
        std::fs::write(p, text).map_err(|e| e.to_string())?;
    }
    registry
        .windows
        .entry(window.label().into())
        .or_default()
        .path = path;
    Ok(true)
}

#[tauri::command]
pub fn document_edited(window: WebviewWindow, dirty: bool) {
    window
        .state::<Documents>()
        .0
        .lock()
        .unwrap()
        .windows
        .entry(window.label().into())
        .or_default()
        .dirty = dirty;
}

#[tauri::command]
pub fn document_menu(window: WebviewWindow, rid: u32) -> Result<(), String> {
    let menu = (*window
        .resources_table()
        .get::<Menu<tauri::Wry>>(rid)
        .map_err(|e| e.to_string())?)
    .clone();
    window
        .state::<Documents>()
        .0
        .lock()
        .unwrap()
        .windows
        .entry(window.label().into())
        .or_default()
        .menu = Some(menu.clone());
    if window.is_focused().unwrap_or(false) {
        window
            .app_handle()
            .set_menu(menu)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn focused(app: &AppHandle, label: &str) {
    let menu = app
        .state::<Documents>()
        .0
        .lock()
        .unwrap()
        .windows
        .get(label)
        .and_then(|d| d.menu.clone());
    if let Some(menu) = menu {
        let _ = app.set_menu(menu);
    }
}

pub fn removed(app: &AppHandle, label: &str) {
    app.state::<Documents>()
        .0
        .lock()
        .unwrap()
        .windows
        .remove(label);
}

#[tauri::command]
pub fn quit_documents(app: AppHandle) {
    let state = app.state::<Documents>();
    let mut registry = state.0.lock().unwrap();
    if registry.quit_prompt {
        return;
    }
    let names = registry.dirty_documents();
    if names.is_empty() {
        drop(registry);
        app.exit(0);
        return;
    }
    registry.quit_prompt = true;
    drop(registry);
    app.dialog()
        .message(format!(
            "Discard unsaved changes and quit?\n\n{}",
            names
                .iter()
                .map(|(_, name)| name.as_str())
                .collect::<Vec<_>>()
                .join("\n")
        ))
        .title("Unsaved changes")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Discard and Quit".into(),
            "Cancel".into(),
        ))
        .show(move |discard| {
            let state = app.state::<Documents>();
            let mut registry = state.0.lock().unwrap();
            registry.quit_prompt = false;
            if !discard {
                return;
            }
            let approved = registry.dirty_documents().is_subset(&names);
            drop(registry);
            if approved {
                app.exit(0);
            } else {
                quit_documents(app.clone());
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quit_consent_covers_only_the_dirty_documents_listed() {
        let mut registry = Registry::default();
        registry.windows.insert(
            "main".into(),
            Document {
                path: Some("/draft/a.md".into()),
                dirty: true,
                ..Default::default()
            },
        );
        registry.windows.insert("doc-2".into(), Document::default());
        let listed = registry.dirty_documents();
        assert_eq!(
            listed,
            BTreeSet::from([("main".into(), "/draft/a.md".into())])
        );
        registry.windows.get_mut("doc-2").unwrap().dirty = true;
        assert!(!registry.dirty_documents().is_subset(&listed));
        registry.windows.remove("doc-2");
        assert!(registry.dirty_documents().is_subset(&listed));
        registry.windows.get_mut("main").unwrap().path = Some("/draft/b.md".into());
        assert!(!registry.dirty_documents().is_subset(&listed));
    }
}
