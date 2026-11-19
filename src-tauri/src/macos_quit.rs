// AppKit sends Dock Quit and Apple-event quit directly to the NSApplication
// delegate. Tao's delegate only receives applicationWillTerminate, too late
// to cancel. Supply the optional should-terminate method on that delegate.
use objc2::{
    class, ffi, msg_send,
    runtime::{AnyClass, AnyObject, Imp, Sel},
    sel,
};
use std::sync::OnceLock;
use tauri::AppHandle;

static APP: OnceLock<AppHandle> = OnceLock::new();

extern "C-unwind" fn should_terminate(_: &AnyObject, _: Sel, _: &AnyObject) -> usize {
    if let Some(app) = APP.get() {
        super::documents::quit_documents(app.clone());
    }
    0 // NSTerminateCancel; quit_documents exits the event loop after approval.
}

pub fn install(app: AppHandle) -> Result<(), &'static str> {
    APP.set(app).map_err(|_| "Quit handler already installed")?;
    // setup executes on AppKit's main thread. NSApplication owns the delegate.
    unsafe {
        let application: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        let delegate: *mut AnyObject = msg_send![application, delegate];
        let class = delegate
            .as_ref()
            .ok_or("NSApplication has no delegate")?
            .class();
        let imp = std::mem::transmute::<
            extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> usize,
            Imp,
        >(should_terminate);
        if !ffi::class_addMethod(
            class as *const AnyClass as *mut _,
            sel!(applicationShouldTerminate:),
            imp,
            c"Q@:@".as_ptr(),
        )
        .as_bool()
        {
            return Err("Could not install document quit handler");
        }
    }
    Ok(())
}
