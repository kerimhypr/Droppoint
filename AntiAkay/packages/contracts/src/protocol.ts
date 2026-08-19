export enum Opcode {
  HELLO = 0,
  HEARTBEAT = 1,
  HEARTBEAT_ACK = 2,
  IDENTIFY = 3,
  RESUME = 4,
  DISPATCH = 5,
  REQUEST = 6,
  RESPONSE = 7,
  CLOSE = 8,
  VOICE_SIGNAL = 9,
  RECONNECT = 10,
  /** Optional diagnostic heartbeat carrying client health counters. */
  HEAVY_HEARTBEAT = 11
}

export type EventName =
  | "READY"
  | "MESSAGE_CREATE"
  | "MESSAGE_UPDATE"
  | "MESSAGE_DELETE"
  | "MESSAGE_REACTION_ADD"
  | "TYPING_START"
  | "PRESENCE_UPDATE"
  | "VOICE_STATE_UPDATE"
  | "VOICE_SERVER_UPDATE"
  | "GUILD_SNAPSHOT";

export interface Envelope<T = unknown> {
  op: Opcode;
  d: T;
  s?: number;
  t?: EventName;
  r?: string;
}

export interface HelloPayload {
  heartbeat_interval_ms: number;
  session_timeout_ms: number;
  protocol_version: 1;
}

export interface IdentifyPayload {
  token: string;
  device_id: string;
  capabilities?: number;
}

export interface ResumePayload {
  token: string;
  session_id: string;
  seq: number;
}

export interface HeartbeatPayload {
  seq: number;
  client_time_ms: number;
  stats?: { audio_rms?: number; uplink_kbps?: number; downlink_kbps?: number };
}

export interface DispatchPayload<T = unknown> {
  event_id: string;
  data: T;
}

export function isEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Envelope>;
  return Number.isInteger(candidate.op) && "d" in candidate;
}
