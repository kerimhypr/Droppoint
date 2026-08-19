import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { Pool } from "pg";
import WebSocket, { WebSocketServer } from "ws";
import {
  Envelope,
  EventName,
  HeartbeatPayload,
  HelloPayload,
  IdentifyPayload,
  Opcode,
  ResumePayload,
  isEnvelope
} from "@clone/contracts";

const PORT = Number(process.env.PORT ?? 8080);
const MAX_FRAME_BYTES = 64 * 1024;
const HEARTBEAT_INTERVAL_MS = 20_000;
const RESUME_TTL_SECONDS = 300;
const RESUME_BUFFER_SIZE = 200;

export interface Identity {
  userId: string;
  guildIds: string[];
}

export interface AuthService {
  verifyAccessToken(token: string): Promise<Identity>;
}

/** Replace this fail-closed adapter with OIDC/Supabase Auth/JWT verification. */
const authService: AuthService = {
  async verifyAccessToken(_token) {
    throw new Error("AuthService is not configured; refusing unauthenticated access");
  }
};

type DispatchEnvelope = Envelope<{ event_id: string; data: unknown }>;

class RedisResumeStore {
  constructor(private readonly redis: Redis) {}

  private key(sessionId: string): string {
    return `gateway:resume:${sessionId}`;
  }

  async append(sessionId: string, envelope: DispatchEnvelope): Promise<void> {
    const key = this.key(sessionId);
    const serialized = JSON.stringify(envelope);
    await this.redis
      .multi()
      .lpush(key, serialized)
      .ltrim(key, 0, RESUME_BUFFER_SIZE - 1)
      .expire(key, RESUME_TTL_SECONDS)
      .exec();
  }

  async replayAfter(sessionId: string, lastSequence: number): Promise<DispatchEnvelope[]> {
    const rows = await this.redis.lrange(this.key(sessionId), 0, RESUME_BUFFER_SIZE - 1);
    return rows
      .map((row) => JSON.parse(row) as DispatchEnvelope)
      .filter((event) => (event.s ?? 0) > lastSequence)
      .sort((a, b) => (a.s ?? 0) - (b.s ?? 0));
  }
}

class Gateway {
  readonly connections = new Set<GatewayConnection>();
  private readonly byGuild = new Map<string, Set<GatewayConnection>>();

  constructor(readonly resumeStore: RedisResumeStore) {}

  attach(connection: GatewayConnection): void {
    this.connections.add(connection);
  }

  detach(connection: GatewayConnection): void {
    this.connections.delete(connection);
    for (const guildId of connection.identity?.guildIds ?? []) {
      const members = this.byGuild.get(guildId);
      members?.delete(connection);
      if (members?.size === 0) this.byGuild.delete(guildId);
    }
  }

  registerGuilds(connection: GatewayConnection, guildIds: string[]): void {
    for (const guildId of guildIds) {
      const members = this.byGuild.get(guildId) ?? new Set<GatewayConnection>();
      members.add(connection);
      this.byGuild.set(guildId, members);
    }
  }

  async dispatchToGuild(guildId: string, event: EventName, data: unknown): Promise<void> {
    const recipients = this.byGuild.get(guildId) ?? [];
    await Promise.all([...recipients].map((connection) => connection.dispatch(event, data)));
  }
}

class GatewayConnection {
  identity?: Identity;
  sessionId?: string;
  private sequence = 0;
  private dispatchQueue: Promise<void> = Promise.resolve();
  private heartbeatTimer?: NodeJS.Timeout;
  private lastHeartbeatAt = Date.now();
  private identified = false;
  private closed = false;

  constructor(private readonly ws: WebSocket, private readonly gateway: Gateway) {
    gateway.attach(this);
    ws.on("message", (raw) => void this.onMessage(raw.toString()));
    ws.on("close", () => this.dispose());
    ws.on("error", () => this.dispose());
    this.send<HelloPayload>(Opcode.HELLO, {
      heartbeat_interval_ms: HEARTBEAT_INTERVAL_MS,
      session_timeout_ms: HEARTBEAT_INTERVAL_MS * 3,
      protocol_version: 1
    });
    this.heartbeatTimer = setInterval(() => this.checkHeartbeat(), HEARTBEAT_INTERVAL_MS);
  }

  private send<T>(op: Opcode, d: T, extras: Partial<Envelope> = {}): void {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ op, d, ...extras } satisfies Envelope<T>));
  }

  async dispatch(event: EventName, data: unknown): Promise<void> {
    const task = async (): Promise<void> => {
      if (!this.sessionId || !this.identity) return;
      const envelope: DispatchEnvelope = {
        op: Opcode.DISPATCH,
        s: ++this.sequence,
        t: event,
        d: { event_id: randomUUID(), data }
      };
      await this.gateway.resumeStore.append(this.sessionId, envelope);
      if (!this.closed && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(envelope));
    };
    this.dispatchQueue = this.dispatchQueue.then(task, task);
    return this.dispatchQueue;
  }

  private async onMessage(raw: string): Promise<void> {
    if (Buffer.byteLength(raw, "utf8") > MAX_FRAME_BYTES) return this.close(4002, "frame too large");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.close(4002, "invalid json");
    }
    if (!isEnvelope(parsed)) return this.close(4002, "invalid envelope");

    switch (parsed.op) {
      case Opcode.HEARTBEAT:
      case Opcode.HEAVY_HEARTBEAT:
        return this.heartbeat(parsed.d as HeartbeatPayload);
      case Opcode.IDENTIFY:
        return this.identify(parsed.d as IdentifyPayload);
      case Opcode.RESUME:
        return this.resume(parsed.d as ResumePayload);
      case Opcode.REQUEST:
        if (!this.identified) return this.close(4003, "identify required");
        // Domain handlers call repositories after this point. The socket never
        // performs authorization based on client-supplied channel/guild IDs.
        this.send(Opcode.RESPONSE, { ok: true, request_id: parsed.r ?? null });
        return;
      case Opcode.VOICE_SIGNAL:
        if (!this.identified) return this.close(4003, "identify required");
        // Forward only after checking CONNECT/SPEAK permissions in the media service.
        this.send(Opcode.RESPONSE, { ok: true, forwarded: true }, { r: parsed.r });
        return;
      default:
        return this.close(4002, "unsupported opcode");
    }
  }

  private heartbeat(payload: HeartbeatPayload): void {
    this.lastHeartbeatAt = Date.now();
    this.send(Opcode.HEARTBEAT_ACK, { server_time_ms: Date.now(), echo_seq: payload?.seq ?? 0 });
  }

  private async identify(payload: IdentifyPayload): Promise<void> {
    if (this.identified) return this.close(4005, "already identified");
    try {
      this.identity = await authService.verifyAccessToken(payload.token);
    } catch {
      return this.close(4004, "authentication failed");
    }
    this.sessionId = randomUUID();
    this.identified = true;
    this.gateway.registerGuilds(this, this.identity.guildIds);
    this.send(Opcode.DISPATCH, {
      event_id: randomUUID(),
      data: { session_id: this.sessionId, user_id: this.identity.userId, guild_ids: this.identity.guildIds }
    }, { t: "READY", s: this.sequence });
  }

  private async resume(payload: ResumePayload): Promise<void> {
    if (this.identified) return this.close(4005, "already identified");
    try {
      this.identity = await authService.verifyAccessToken(payload.token);
      const missed = await this.gateway.resumeStore.replayAfter(payload.session_id, payload.seq);
      if (missed.length > 0 && missed[0].s !== payload.seq + 1) {
        return this.close(4006, "resume buffer expired");
      }
      this.sessionId = payload.session_id;
      this.sequence = payload.seq;
      this.identified = true;
      this.gateway.registerGuilds(this, this.identity.guildIds);
      for (const event of missed) {
        this.sequence = event.s ?? this.sequence;
        this.send(event.op, event.d, { s: event.s, t: event.t });
      }
      this.send(Opcode.DISPATCH, { event_id: randomUUID(), data: { session_id: this.sessionId } }, { t: "READY", s: this.sequence });
    } catch {
      this.close(4006, "resume failed");
    }
  }

  private checkHeartbeat(): void {
    if (Date.now() - this.lastHeartbeatAt > HEARTBEAT_INTERVAL_MS * 2.5) this.close(4007, "heartbeat timeout");
  }

  private close(code: number, reason: string): void {
    if (!this.closed) this.ws.close(code, reason);
  }

  private dispose(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.gateway.detach(this);
  }
}

const httpServer = createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, service: "gateway" }));
    return;
  }
  response.writeHead(404).end();
});

const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", { maxRetriesPerRequest: 2 });
const redisSubscriber = redis.duplicate();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20, idleTimeoutMillis: 30_000 });
void pool.query("select 1").catch((error) => console.error("database warmup failed", error));
const gateway = new Gateway(new RedisResumeStore(redis));
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean));
const wss = new WebSocketServer({
  server: httpServer,
  path: "/gateway",
  maxPayload: MAX_FRAME_BYTES,
  verifyClient: ({ origin }) => process.env.NODE_ENV !== "production" || allowedOrigins.has(origin)
});
wss.on("connection", (socket) => new GatewayConnection(socket, gateway));

// Cross-instance fan-out. Domain services publish {guild_id,event,data}; every
// gateway instance delivers only to its local sockets and persists resume state.
void redisSubscriber.subscribe("gateway:dispatch");
redisSubscriber.on("message", (_channel, raw) => {
  const event = JSON.parse(raw) as { guild_id: string; event: EventName; data: unknown };
  void gateway.dispatchToGuild(event.guild_id, event.event, event.data);
});

httpServer.listen(PORT, "0.0.0.0", () => console.log(`gateway listening on ${PORT}`));

const shutdown = async (): Promise<void> => {
  wss.close();
  httpServer.close();
  await Promise.all([redis.quit(), redisSubscriber.quit(), pool.end()]);
};
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
