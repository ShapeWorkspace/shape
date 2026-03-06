# Shape Desktop & Mobile (Tauri 2.x)

Cross-platform desktop and mobile application for Shape built with Tauri 2.9.

## Prerequisites

### Desktop (macOS/Windows/Linux)
- Rust 1.77+
- Node.js 18+
- Platform-specific dependencies (see [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/))

### iOS
- macOS only
- Xcode 15+
- iOS Simulator or physical device
- Apple Developer account with Team ID
- Install Rust iOS targets:
  ```bash
  rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
  ```
- Configure your Team ID in `src-tauri/tauri.ios.conf.json`:
  ```json
  {
    "bundle": {
      "iOS": {
        "developmentTeam": "YOUR_TEAM_ID"
      }
    }
  }
  ```

### Android
- Android Studio with SDK & NDK
- Install Rust Android targets:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
  ```

## Development

Dev mode loads the UI from the Vite dev server at `http://localhost:5173`.

```bash
# Desktop development (requires web dev server running first)
yarn desktop

# Or explicitly:
yarn workspace @shape/desktop dev
```

## Desktop development

Terminal 1 - Web dev server (proxies to local Go server):
yarn workspace @shape/web dev:desktop

Terminal 2 - Desktop app:
yarn workspace @shape/desktop dev

## Mobile Development

Initialize mobile targets (run once per platform):

```bash
# iOS (requires Team ID configured)
yarn workspace @shape/desktop ios:init

# Android
yarn workspace @shape/desktop android:init
```

Run on mobile:

```bash
# iOS Simulator
yarn workspace @shape/desktop ios:dev

# Android Emulator
yarn workspace @shape/desktop android:dev
```

Here’s the straight path for Tauri iOS on a physical device.

One‑time setup (if you haven’t done it yet)

1. Ensure Team ID is set in desktop/src-tauri/tauri.ios.conf.json.
2. Run (once):

yarn workspace @shape/desktop ios:init

Every time you run on device

1. Start the web dev server (mobile mode) from repo root:

VITE_API_URL=https://app.shape.work/api yarn workspace @shape/web dev:mobile --host 0.0.0.0 --port
5173

2. In a second terminal, run the iOS dev build:

yarn workspace @shape/desktop ios:dev

building every time is slower and you lose hot reload. If you still
want that, do this:

1. Build the mobile web bundle:

yarn workspace @shape/web build:mobile

2. Run the iOS app (uses bundled web/dist because devUrl is null):

yarn workspace @shape/desktop ios:dev

That will always use the latest web/dist you just built. If you prefer a single command, say the
word and I’ll add a script to chain these.

Point to Local Dev Server

# Terminal 1: Web dev server pointing to YOUR local API
VITE_API_URL=http://<YOUR_LOCAL_IP>:8080/api yarn workspace @shape/web dev:mobile --host 0.0.0.0 --port 5173

# Terminal 2: iOS dev build
yarn workspace @shape/desktop ios:dev

Replace <YOUR_LOCAL_IP> with your Mac's local IP (e.g., 192.168.1.42). Find it with:

ipconfig getifaddr en0

There's your problem. devUrl is null, so it's using the pre-bundled web/dist (which was built pointing to prod).

You have two options:

Option A: Enable hot reload with devUrl (recommended for dev)

# Terminal 1: Start Vite dev server
VITE_API_URL=http://10.0.0.153:8080/api yarn workspace @shape/web dev:mobile --host 0.0.0.0 --port 5173

Then temporarily set devUrl to your Mac's IP:

⏺ Update(desktop/src-tauri/tauri.ios.conf.json)
⎿  Added 1 line, removed 1 line
   1   {
   2     "$schema": "https://schema.tauri.app/config/2",
   3     "build": {
   4 -     "devUrl": null
   4 +     "devUrl": "http://10.0.0.153:5173"
   5     },
   6     "bundle": {
   7       "iOS": {

# Terminal 1: Start Vite pointing to local API (script will remind you)
VITE_API_URL=http://10.0.0.153:8080/api yarn workspace @shape/web dev:mobile --host 0.0.0.0 --port 5173

# Terminal 2: Run iOS on device with auto-detected local IP
yarn workspace @shape/desktop ios:dev:local

The script:
- Auto-detects your local IP
- Passes it as a config override to Tauri (no file changes)
- Prints the Vite command you need to run
- Optionally accepts a device name argument

## Production Build

Production bundles the frontend from `../../dist` (built by root `yarn build`).

```bash
# Build desktop installers/binaries
yarn desktop:build

# iOS build
yarn workspace @shape/desktop ios:build

# Android APK
yarn workspace @shape/desktop tauri android build --apk true
```

## Project Structure

```
desktop/
├── package.json              # Package config with desktop/mobile scripts
├── src/
│   └── index.html           # HTML entry point
└── src-tauri/
    ├── Cargo.toml           # Rust dependencies
    ├── tauri.conf.json      # Main Tauri configuration
    ├── tauri.ios.conf.json  # iOS-specific config (Team ID)
    ├── capabilities/        # Permission capabilities
    │   └── default.json     # Default app permissions
    ├── gen/
    │   └── android/         # Generated Android project
    ├── icons/               # Platform-specific icons
    └── src/
        ├── lib.rs           # Shared core (mobile entry point)
        └── main.rs          # Desktop entry point
```
