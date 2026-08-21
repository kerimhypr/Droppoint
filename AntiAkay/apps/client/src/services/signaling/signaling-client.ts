/**
 * SignalingClient — temiz WebSocket abstraction.
 * UI doğrudan WebSocket eventleriyle uğraşmaz.
 * Kontrat: packages/contracts/src/protocol.ts + docs/architecture.md §5
 * Opcode: 0 HELLO .. 11 HEAVY_HEARTBEAT
 * Events: READY, MESSAGE_CREATE/UPDATE/DELETE, TYPING_START, PRESENCE_UPDATE, VOICE_STATE_UPDATE, VOICE_SERVER_UPDATE
 */
import { Opcode, type Envelope, type EventName, type HelloPayload, isEnvelope } from "@clone/contracts";
import { supabaseAuth } from "../../lib/supabase";
import { env } from "../../lib/env";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "failed";
export type SignalingEvents = {
  hello: (payload: HelloPayload) => void;
  ready: (payload: { session_id: string; user_id: string; guild_ids: string[] }) => void;
  dispatch: (event: EventName, data: unknown, seq: number) => void;
  state: (state: ConnectionState) => void;
  error: (error: Error) => void;
  close: (code: number, reason: string) => void;
};

type PendingRequest = { resolve: (v: unknown)=>void; reject:(e:Error)=>void; timer: ReturnType<typeof setTimeout> };

export class SignalingClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private hello: HelloPayload | null = null;
  private sessionId: string | null = null;
  private lastSeq = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private deviceId: string;
  private listeners = new Map<keyof SignalingEvents, Set<(...args: unknown[])=>void>>();
  private pending = new Map<string, PendingRequest>();
  private closedByUser = false;

  constructor(private url: string = env.signalingUrl) {
    let stored = localStorage.getItem("orbit_device_id");
    if (!stored) {
      stored = crypto.randomUUID();
      localStorage.setItem("orbit_device_id", stored);
    }
    this.deviceId = stored;
    const saved = localStorage.getItem("orbit_session");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { session_id: string; seq: number };
        this.sessionId = parsed.session_id;
        this.lastSeq = parsed.seq ?? 0;
      } catch { /* ignore */ }
    }
  }

  on<K extends keyof SignalingEvents>(event: K, fn: SignalingEvents[K]): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as (...args:unknown[])=>void);
    return () => this.listeners.get(event)!.delete(fn as (...args:unknown[])=>void);
  }
  private emit<K extends keyof SignalingEvents>(event: K, ...args: Parameters<SignalingEvents[K]>): void {
    this.listeners.get(event)?.forEach((fn) => {
      try { (fn as (...a: unknown[])=>void)(...args); } catch { /* ignore */ }
    });
  }

  private setState(s: ConnectionState): void {
    if (this.state !== s) {
      this.state = s;
      this.emit("state", s);
    }
  }

  get connectionState(): ConnectionState { return this.state; }
  get sequence(): number { return this.lastSeq; }

  async connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.closedByUser = false;
    this.setState(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");
    await this.openWebSocket();
  }

  private openWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        this.setState("failed");
        reject(e);
        return;
      }
      const ws = this.ws;
      const onOpen = () => {
        this.reconnectAttempts = 0;
        this.setState("connected");
        resolve();
      };
      const onError = () => {
        // will trigger onclose as well
      };
      const onClose = (ev: CloseEvent) => {
        this.cleanupHeartbeat();
        this.emit("close", ev.code, ev.reason);
        // pending requests fail
        for (const [id, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error(`signaling closed ${ev.code} ${ev.reason}`));
          this.pending.delete(id);
        }
        if (!this.closedByUser) this.scheduleReconnect(ev.code, ev.reason);
        else this.setState("disconnected");
      };
      const onMessage = (ev: MessageEvent) => this.handleMessage(ev.data as string);
      ws.addEventListener("open", onOpen, { once: true });
      ws.addEventListener("error", onError, { once: true });
      ws.addEventListener("close", onClose, { once: true });
      ws.addEventListener("message", onMessage);
      // remove open/error listeners after resolve/reject to avoid leak is handled by once:true
      ws.addEventListener("close", () => {
        ws.removeEventListener("message", onMessage);
      }, { once: true });
    });
  }

  private scheduleReconnect(code: number, reason: string): void {
    // 4006 => resume expired => full reconnect with IDENTIFY
    if (code === 4006) {
      this.sessionId = null;
      this.lastSeq = 0;
      localStorage.removeItem("orbit_session");
    }
    // Don't reconnect on auth failures
    if (code === 4004 || code === 4003) {
      this.setState("failed");
      this.emit("error", new Error(`authentication failed: ${reason}`));
      return;
    }
    this.setState("reconnecting");
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000) + Math.random()*300;
    this.reconnectAttempts++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.openWebSocket();
        // try resume or identify
        await this.authenticate();
      } catch (e) {
        this.emit("error", e as Error);
        this.scheduleReconnect(1011, "reconnect failed");
      }
    }, delay);
  }

  private cleanupHeartbeat(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private startHeartbeat(intervalMs: number): void {
    this.cleanupHeartbeat();
    let seq = 0;
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendRaw({ op: Opcode.HEARTBEAT, d: { seq: ++seq, client_time_ms: Date.now() } });
      }
    }, intervalMs);
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return; }
    if (!isEnvelope(parsed)) return;
    const envlp = parsed as Envelope<unknown>;

    switch (envlp.op) {
      case Opcode.HELLO: {
        this.hello = envlp.d as HelloPayload;
        this.emit("hello", this.hello);
        this.startHeartbeat(this.hello.heartbeat_interval_ms);
        // auto auth after hello
        void this.authenticate();
        break;
      }
      case Opcode.HEARTBEAT_ACK: {
        break;
      }
      case Opcode.DISPATCH: {
        const seq = envlp.s ?? 0;
        if (seq) {
          this.lastSeq = Math.max(this.lastSeq, seq);
          if (this.sessionId) localStorage.setItem("orbit_session", JSON.stringify({ session_id: this.sessionId, seq: this.lastSeq }));
        }
        const t = envlp.t as EventName | undefined;
        const d = (envlp.d as { data?: unknown; event_id?: string })?.data ?? envlp.d;
        if (t === "READY") {
          const data = d as { session_id: string; user_id: string; guild_ids: string[] };
          if (data?.session_id) {
            this.sessionId = data.session_id;
            localStorage.setItem("orbit_session", JSON.stringify({ session_id: this.sessionId, seq: this.lastSeq }));
          }
          this.emit("ready", data);
        }
        if (t) this.emit("dispatch", t, d, seq);
        break;
      }
      case Opcode.RESPONSE: {
        const rid = envlp.r;
        if (rid && this.pending.has(rid)) {
          const p = this.pending.get(rid)!;
          clearTimeout(p.timer);
          this.pending.delete(rid);
          p.resolve(envlp.d);
        }
        break;
      }
      case Opcode.RECONNECT: {
        // server asks to reconnect and RESUME
        this.ws?.close(4000, "reconnect requested");
        break;
      }
      case Opcode.CLOSE: {
        const d = envlp.d as { code?: number; reason?: string } | undefined;
        this.ws?.close(d?.code ?? 4000, d?.reason ?? "server close");
        break;
      }
      case Opcode.VOICE_SIGNAL: {
        // treated as dispatch-style voice signal
        this.emit("dispatch", "VOICE_SERVER_UPDATE" as EventName, envlp.d, envlp.s ?? 0);
        // also generic dispatch for voice
        break;
      }
      default:
        break;
    }
  }

  private sendRaw(envelope: Envelope): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("WebSocket not open");
    this.ws.send(JSON.stringify(envelope));
  }

  // --- public API per spec 16 ---

  async authenticate(): Promise<void> {
    const token = await supabaseAuth.getAccessToken();
    if (!token) throw new Error("No access token — login required");
    // If we have a sessionId, try RESUME first, fallback to IDENTIFY on failure
    if (this.sessionId && this.lastSeq >= 0) {
      try {
        this.sendRaw({ op: Opcode.RESUME, d: { token, session_id: this.sessionId, seq: this.lastSeq } });
        return;
      } catch { /* fallback */ }
    }
    this.sendRaw({ op: Opcode.IDENTIFY, d: { token, device_id: this.deviceId } });
  }

  async joinRoom(channelId: string): Promise<void> {
    // voice join via VOICE_SIGNAL op 9
    this.sendRaw({ op: Opcode.VOICE_SIGNAL, d: { type: "join", channel_id: channelId } });
  }

  async leaveRoom(): Promise<void> {
    this.sendRaw({ op: Opcode.VOICE_SIGNAL, d: { type: "leave" } });
  }

  sendEvent(op: Opcode, data: unknown, correlationId?: string): void {
    this.sendRaw({ op, d: data, r: correlationId });
  }

  // REQUEST abstraction (op 6) with correlation id and RESPONSE wait
  request<T = unknown>(name: string, payload: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T> {
    const r = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(r);
        reject(new Error(`REQUEST timeout: ${name}`));
      }, timeoutMs);
      this.pending.set(r, { resolve: resolve as (v: unknown)=>void, reject, timer });
      this.sendRaw({ op: Opcode.REQUEST, r, d: { name, ...payload } });
    });
  }

  sendVoiceSignal(signal: unknown): void {
    this.sendRaw({ op: Opcode.VOICE_SIGNAL, d: signal as Record<string, unknown> });
  }

  disconnect(): void {
    this.closedByUser = true;
    this.cleanupHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      try { this.ws.close(1000, "client disconnect"); } catch { /* ignore */ }
      this.ws = null;
    }
    this.setState("disconnected");
  }

  reconnect(): Promise<void> {
    this.disconnect();
    this.closedByUser = false;
    return this.connect();
  }
}

export const signalingClient = new SignalingClient();
