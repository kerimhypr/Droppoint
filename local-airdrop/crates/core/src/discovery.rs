use crate::protocol::{PeerAnnouncement, SERVICE};
use anyhow::{Context, Result};
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::{net::IpAddr, sync::Arc, time::Duration};
use tokio::sync::watch;
use uuid::Uuid;

pub async fn run(
    announcement: PeerAnnouncement,
    mut stop: watch::Receiver<bool>,
    on_peer: Arc<dyn Fn(PeerAnnouncement, IpAddr) + Send + Sync>,
) -> Result<()> {
    let daemon = ServiceDaemon::new().context("create mDNS daemon")?;
    let instance = format!("{}._droppoint._tcp.local.", announcement.device_id);
    let props = vec![
        ("device_id", announcement.device_id.to_string()),
        ("device_name", announcement.device_name.clone()),
        ("os_type", announcement.os_type.clone()),
        ("status", announcement.status.clone()),
        ("protocol", announcement.protocol.to_string()),
    ];
    let host = format!("{}.local.", announcement.device_id);
    let info = ServiceInfo::new(
        SERVICE,
        &instance,
        &host,
        "0.0.0.0",
        announcement.port,
        props,
    )?;
    daemon.register(info)?;
    let receiver = daemon.browse(SERVICE)?;
    loop {
        tokio::select! {
            _ = stop.changed() if *stop.borrow() => { let _ = daemon.shutdown(); return Ok(()); }
            event = tokio::task::spawn_blocking({ let receiver = receiver.clone(); move || receiver.recv().ok() }) => {
                if let Ok(Some(ServiceEvent::ServiceResolved(info))) = event {
                    if let Some(id) = info.get_property_val_str("device_id").and_then(|v| Uuid::parse_str(v).ok()) && id != announcement.device_id {
                        let peer = PeerAnnouncement { protocol: info.get_property_val_str("protocol").and_then(|v| v.parse().ok()).unwrap_or(1), device_id: id, device_name: info.get_property_val_str("device_name").unwrap_or("Unknown").into(), os_type: info.get_property_val_str("os_type").unwrap_or("unknown").into(), port: info.get_port(), status: info.get_property_val_str("status").unwrap_or("online").into() };
                        if let Some(ip) = info.get_addresses().iter().next() { on_peer(peer, *ip); }
                    }
                }
            }
        }
    }
}

pub fn heartbeat_period() -> Duration {
    Duration::from_secs(5)
}

/// Heartbeat cadence used by every platform host to evict peers that have not
/// responded for three intervals. The host owns the peer table because the
/// UI decides whether a peer is displayed as offline or removed.
pub fn peer_expiry() -> Duration {
    heartbeat_period() * 3
}
