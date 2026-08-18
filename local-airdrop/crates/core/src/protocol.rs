use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const SERVICE: &str = "_droppoint._tcp.local.";
pub const PROTOCOL_VERSION: u16 = 1;
pub const MAX_CONTROL_FRAME: usize = 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerAnnouncement {
    pub protocol: u16,
    pub device_id: Uuid,
    pub device_name: String,
    pub os_type: String,
    pub port: u16,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ControlMessage {
    Hello {
        announcement: PeerAnnouncement,
    },
    Heartbeat {
        device_id: Uuid,
        at_unix_ms: u64,
    },
    Clipboard {
        origin: Uuid,
        sha256: String,
        text: String,
    },
    FileOffer {
        transfer_id: Uuid,
        name: String,
        size: u64,
        sha256: String,
    },
    Accept {
        transfer_id: Uuid,
    },
    Reject {
        transfer_id: Uuid,
    },
}
