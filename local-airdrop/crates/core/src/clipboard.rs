use sha2::{Digest, Sha256};
use std::{sync::{Arc, Mutex}, time::{Duration, Instant}};
use tokio::sync::mpsc;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClipboardValue { pub text: String, pub sha256: String }

#[derive(Debug)]
pub struct ClipboardGate {
    last_published: Option<String>,
    last_seen: Option<String>,
    candidate: Option<ClipboardValue>,
    changed_at: Instant,
    debounce: Duration,
}

impl ClipboardGate {
    pub fn new(debounce: Duration) -> Self { Self { last_published: None, last_seen: None, candidate: None, changed_at: Instant::now(), debounce } }
    pub fn digest(text: &str) -> String { let mut h = Sha256::new(); h.update(text.as_bytes()); format!("{:x}", h.finalize()) }
    pub fn local_change(&mut self, text: &str, now: Instant) -> Option<ClipboardValue> {
        let hash = Self::digest(text);
        if self.last_published.as_deref() == Some(&hash) { return None; }
        if self.candidate.as_ref().map(|v| &v.sha256) != Some(&hash) {
            self.candidate = Some(ClipboardValue { text: text.to_owned(), sha256: hash }); self.changed_at = now; return None;
        }
        if now.duration_since(self.changed_at) < self.debounce { return None; }
        let value = self.candidate.take()?;
        self.last_seen = Some(value.sha256.clone()); self.last_published = Some(value.sha256.clone()); Some(value)
    }
    pub fn remote_value(&mut self, value: &ClipboardValue) -> bool {
        if self.last_seen.as_deref() == Some(&value.sha256) { return false; }
        self.last_seen = Some(value.sha256.clone()); self.last_published = Some(value.sha256.clone()); true
    }
}

pub type ClipboardSender = mpsc::Sender<ClipboardValue>;
pub type ClipboardReceiver = mpsc::Receiver<ClipboardValue>;

pub fn channel() -> (ClipboardSender, ClipboardReceiver) { mpsc::channel(64) }

pub fn apply_remote(value: &ClipboardValue, gate: &Arc<Mutex<ClipboardGate>>) -> bool {
    let Ok(mut guard) = gate.lock() else { return false; };
    if !guard.remote_value(value) { return false; }
    platform_set(&value.text);
    true
}

pub fn spawn_listener(gate: Arc<Mutex<ClipboardGate>>, sender: ClipboardSender) -> tokio::task::JoinHandle<()> {
    tokio::task::spawn_blocking(move || {
        let mut previous = String::new();
        loop {
            if let Some(text) = platform_get() {
                let changed = text != previous;
                previous = text.clone();
                if changed || gate.lock().ok().and_then(|mut g| g.local_change(&text, Instant::now())).is_some() {
                    if let Ok(mut g) = gate.lock() {
                        if let Some(value) = g.local_change(&text, Instant::now()) && sender.blocking_send(value).is_err() { break; }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    })
}

#[cfg(target_os = "linux")]
fn platform_get() -> Option<String> {
    use std::process::Command;
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some();
    let mut command = Command::new(if wayland { "wl-paste" } else { "xclip" });
    if wayland { command.args(["--no-newline", "--type", "text/plain"]); } else { command.args(["-selection", "clipboard", "-o"]); }
    command.output().ok().filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
}
#[cfg(target_os = "linux")]
fn platform_set(text: &str) {
    use std::{io::Write, process::{Command, Stdio}};
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some();
    let mut command = Command::new(if wayland { "wl-copy" } else { "xclip" });
    if wayland { command.args(["--type", "text/plain"]); } else { command.args(["-selection", "clipboard", "-in"]); }
    if let Ok(mut child) = command.stdin(Stdio::piped()).spawn() { if let Some(stdin) = child.stdin.as_mut() { let _ = stdin.write_all(text.as_bytes()); } let _ = child.wait(); }
}

#[cfg(target_os = "windows")]
fn platform_get() -> Option<String> { None }
#[cfg(target_os = "windows")]
fn platform_set(_: &str) {}
#[cfg(target_os = "macos")]
fn platform_get() -> Option<String> { std::process::Command::new("/usr/bin/pbpaste").output().ok().filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).into_owned()) }
#[cfg(target_os = "macos")]
fn platform_set(text: &str) { use std::io::Write; if let Ok(mut p) = std::process::Command::new("/usr/bin/pbcopy").stdin(std::process::Stdio::piped()).spawn() { if let Some(i) = p.stdin.as_mut() { let _ = i.write_all(text.as_bytes()); } let _ = p.wait(); } }
#[cfg(any(target_os = "android", target_os = "ios"))]
fn platform_get() -> Option<String> { None }
#[cfg(any(target_os = "android", target_os = "ios"))]
fn platform_set(_: &str) {}
