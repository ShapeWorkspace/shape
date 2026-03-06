// Shape Desktop/Mobile Application - Tauri Core Library
//
// This library provides the shared core for both desktop and mobile builds.
// Mobile platforms (iOS/Android) load this as a shared library, while desktop
// platforms use main.rs as the entry point which calls into this library.

mod keychain;

use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri::{RunEvent, WindowEvent};

/// Determine whether production builds should open DevTools for debugging.
/// This is intentionally opt-in to avoid shipping always-on inspector access.
#[allow(dead_code)]
fn should_open_devtools_for_release_debugging() -> bool {
    let devtools_environment_value = std::env::var("SHAPE_TAURI_DEVTOOLS").unwrap_or_default();
    let normalized_devtools_environment_value = devtools_environment_value.trim().to_ascii_lowercase();

    matches!(
        normalized_devtools_environment_value.as_str(),
        "1" | "true" | "yes" | "on"
    )
}

/// Configures and runs the Tauri application.
/// Called from main.rs on desktop, and directly from mobile entry points.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // Push notifications are handled by a Tauri plugin so we don't need
        // custom Swift or Objective-C entry points in the iOS project.
        .plugin(tauri_plugin_notifications::init());

    // Android-only: Register keystore plugin for persistent auth token storage.
    #[cfg(target_os = "android")]
    {
        builder = builder.plugin(tauri_plugin_keystore::init());
    }

    builder
        // Register keychain commands for secure token storage.
        .invoke_handler(tauri::generate_handler![
            keychain::set_secret,
            keychain::get_secret,
            keychain::clear_secret,
        ])
        // macOS: Hide window instead of quitting when user clicks the red close button.
        // This matches standard macOS app behavior where closing a window doesn't terminate the app.
        // Closure params prefixed with underscore since they're only used on macOS.
        .on_window_event(|_window, _event| {
            #[cfg(target_os = "macos")]
            if let WindowEvent::CloseRequested { api, .. } = _event {
                // Prevent the window from being destroyed.
                api.prevent_close();
                // Hide the window instead.
                let _ = _window.hide();
            }
        })
        .setup(|app| {
            // Log the data directory for debugging purposes.
            if let Some(data_dir) = app.path().app_data_dir().ok() {
                log::info!("App data directory: {:?}", data_dir);
            }

            // iOS: Configure the webview for edge-to-edge display.
            // This allows the web content to extend behind the safe areas (notch, home indicator).
            // The web app handles safe area insets via CSS env(safe-area-inset-*).
            #[cfg(target_os = "ios")]
            {
                if let Some(webview_window) = app.get_webview_window("main") {
                    let _ = webview_window.with_webview(|webview| {
                        use objc2::runtime::AnyObject;
                        use objc2::msg_send;
                        use objc2_foundation::CGRect;

                        unsafe {
                            // Get the WKWebView from Tauri's webview handle.
                            let wk_webview: *mut AnyObject = webview.inner() as *mut AnyObject;
                            if wk_webview.is_null() {
                                return;
                            }

                            // Disable automatic content inset adjustments on the scroll view.
                            // UIScrollViewContentInsetAdjustmentNever = 3
                            let scroll_view: *mut AnyObject = msg_send![wk_webview, scrollView];
                            if !scroll_view.is_null() {
                                let _: () = msg_send![scroll_view, setContentInsetAdjustmentBehavior: 3i64];
                            }

                            // Walk up the view hierarchy and set all parent views to fill screen bounds.
                            // Tauri wraps WKWebView in container views that may respect safe areas.
                            let mut current_view: *mut AnyObject = wk_webview;
                            while !current_view.is_null() {
                                let superview: *mut AnyObject = msg_send![current_view, superview];
                                if superview.is_null() {
                                    // Reached the root - get its bounds and propagate down.
                                    let root_bounds: CGRect = msg_send![current_view, bounds];

                                    // Now set all views in chain to fill these bounds.
                                    let _: () = msg_send![wk_webview, setFrame: root_bounds];

                                    let webview_superview: *mut AnyObject = msg_send![wk_webview, superview];
                                    if !webview_superview.is_null() {
                                        let _: () = msg_send![webview_superview, setFrame: root_bounds];
                                    }
                                    break;
                                }
                                current_view = superview;
                            }

                            log::info!("Configured iOS webview for edge-to-edge display");
                        }
                    });
                }
            }

            // Open DevTools automatically in debug builds for easier debugging.
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            // Allow opt-in DevTools access in release builds for field debugging.
            // Set SHAPE_TAURI_DEVTOOLS=1 before launching the app to enable.
            #[cfg(not(debug_assertions))]
            {
                if should_open_devtools_for_release_debugging() {
                    if let Some(window) = app.get_webview_window("main") {
                        log::info!("Opening DevTools (release build, SHAPE_TAURI_DEVTOOLS enabled).");
                        window.open_devtools();
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Error while building Shape application")
        // Closure params prefixed with underscore since they're only used on macOS.
        .run(|_app, _event| {
            // macOS: Show hidden window when user clicks the dock icon.
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { .. } = _event {
                if let Some(window) = _app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}
