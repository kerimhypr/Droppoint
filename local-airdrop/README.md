# DropPoint

DropPoint is the local-only AirBridge implementation: a native desktop/mobile
application for device discovery, clipboard synchronization, and peer-to-peer
file transfer. It has no account, cloud database, relay, or required internet
connection.

## Repository layout

```text
crates/core/                 Shared Rust protocol, discovery, clipboard, transfer
apps/desktop/                Tauri v2 tray application
apps/mobile/android/         Android share-sheet entry point
apps/mobile/ios/             iOS Share Extension entry point
```

## Core behavior

- mDNS service `_droppoint._tcp.local.` advertises a UUID, name, OS, port, and status.
- The transport uses bounded length-prefixed chunks (1 MiB maximum) and verifies
  the advertised byte count and SHA-256 before making a received file visible.
- `ClipboardGate` requires a stable clipboard value for the debounce interval and
  records origin hashes. A value received from a peer is not re-published.
- Large transfers should be presented to the user for approval before calling
  `receive_file`; the core never buffers an entire file.
- The tray window is hidden by default and remains available from the system tray.

The platform clipboard adapters are deliberately outside the transport crate:
Linux should use Wayland/X11 native listeners, Windows `AddClipboardFormatListener`,
macOS NSPasteboard notifications, and mobile platform services/Share Extensions.
Each adapter must call `ClipboardGate` before broadcasting and after applying a
remote value.

## Build

Install Rust stable, Node 20+, Tauri prerequisites, and the target SDKs first.
The commands below are run from the repository root.

```bash
cargo +stable check
cd apps/desktop
npm install
npm run tauri build                 # native target
npm run tauri build -- --bundles appimage,deb   # Linux
npm run tauri build -- --bundles nsis           # Windows .exe (on Windows)
npm run tauri build -- --bundles dmg            # macOS (on macOS)
```

For Android, generate the Flutter/Android host around the existing Rust FFI
library, then build the signed artifact:

```bash
cargo +stable build -p droppoint-core --target aarch64-linux-android --release
cd apps/mobile/android
./gradlew assembleRelease
```

The Android manifest registers text and file shares. The iOS Swift file is the
Share Extension receiver; enable App Groups and add the Rust library to the
application and extension targets before archiving.

## Security and release checklist

Before a public release, wire the `TcpStream` in `transfer.rs` through a
platform-pinned TLS client/server context, persist and rotate the per-session
certificate fingerprint, enforce an allow/deny prompt for files over 20 MiB,
and complete the native clipboard adapters. Do not expose the transfer port
outside the LAN firewall. mDNS is discovery, not authentication; certificate
fingerprint verification and explicit peer approval are required for hostile LANs.

This repository is the implementation foundation and native shell, not a claim
that OS clipboard background restrictions can be bypassed: iOS and recent
Android versions impose lifecycle limits that must be handled with their
approved background APIs.

