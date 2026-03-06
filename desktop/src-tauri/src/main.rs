// Shape Desktop Application - Entry Point
//
// This is the desktop-only entry point. Mobile platforms use the lib.rs
// entry point directly via the mobile_entry_point attribute.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    shape_desktop_lib::run();
}
