# Agent A — Realtime Media & Signaling Kontratı (B için)

Bu dosya Agent B'nin WebRTC/signaling entegrasyon kontratıdır. Gerçek sözleşme aşağıdaki dosyalardadır:

- `docs/architecture.md` §5 Gateway protokolü + §2 Ses ve medya akışı
- `packages/contracts/src/protocol.ts` — Opcode & EventName & Envelope
- `packages/contracts/src/permissions.ts` — CONNECT/SPEAK/STREAM izinleri
- `apps/gateway/src/server.ts` — WebSocket lifecycle, heartbeat, RESUME
- `apps/client/src/audio/voice-client.ts` ve `audio-engine.ts` — Client media referansı

## 1. Signaling URL

```
VITE_SIGNALING_URL=wss://orbit-gateway.onrender.com/gateway
VITE_GATEWAY_HTTP_URL=https://orbit-gateway.onrender.com
# local
VITE_SIGNALING_URL=ws://127.0.0.1:8080/gateway
```

Path her zaman `/gateway`. Render `render.yaml` içinde gateway healthCheck `/healthz`.

## 2. Authentication

- **Supabase Auth JWT** gateway'de doğrulanır (`authService.verifyAccessToken`).
- Client `IDENTIFY` (op 3) ile `token` + `device_id` gönderir.
- Başarılı IDENTIFY sonrası server `READY` dispatch eder: `{ session_id, user_id, guild_ids }`.
- `RESUME` (op 4) ile `token + session_id + seq` gönderilir. Resume buffer: Redis `gateway:resume:{session_id}` TTL 300s, son 200 DISPATCH.

### Close codes (server.ts)

| Code | Anlam | Client aksiyon |
|------|-------|----------------|
| 4002 | invalid envelope / frame too large | reconnect değil, bug |
| 4003 | identify required | IDENTIFY gönder |
| 4004 | authentication failed | login ekranı |
| 4005 | already identified | socket'i kapat, yeni socket |
| 4006 | resume buffer expired | sessionId'yi sil, yeniden IDENTIFY |
| 4007 | heartbeat timeout | reconnect + RESUME |
| 1000 | normal close | — |

## 3. Opcode (protocol.ts)

| Op | Ad | Yön | Açıklama |
|---:|---|---|---|
| 0 | HELLO | s→c | `heartbeat_interval_ms`, `session_timeout_ms`, `protocol_version:1` |
| 1 | HEARTBEAT | c→s | `{ seq, client_time_ms, stats? }` |
| 2 | HEARTBEAT_ACK | s→c | `{ server_time_ms, echo_seq }` |
| 3 | IDENTIFY | c→s | `{ token, device_id }` |
| 4 | RESUME | c→s | `{ token, session_id, seq }` |
| 5 | DISPATCH | s→c | `{ s, t, d:{ event_id, data } }` — sıralı event |
| 6 | REQUEST | c→s | `{ r, d:{ name, ... } }` — MESSAGE_CREATE vs |
| 7 | RESPONSE | s→c | `{ r, d:{ ok, ...} }` |
| 8 | CLOSE | both | — |
| 9 | VOICE_SIGNAL | both | SDP/ICE + voice control |
|10 | RECONNECT | s→c | yeni socket + RESUME |
|11 | HEAVY_HEARTBEAT | c→s | audio/network telemetri opsiyonel |

Envelope: `{ op, d, s?, t?, r? }` — `isEnvelope` ile doğrulanır. Max frame 64 KiB.

## 4. Dispatch EventName

`READY`, `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `MESSAGE_REACTION_ADD`, `TYPING_START`, `PRESENCE_UPDATE`, `VOICE_STATE_UPDATE`, `VOICE_SERVER_UPDATE`, `GUILD_SNAPSHOT`.

`MESSAGE_*` ve `TYPING_START` gateway Redis Pub/Sub `gateway:dispatch` üzerinden fan-out edilir.

## 5. REQUEST örnekleri (op 6)

```json
{ "op":6, "r":"cmd-uuid", "d":{ "name":"MESSAGE_CREATE", "channel_id":"uuid", "client_nonce":"uuid", "content":"Merhaba" } }
{ "op":6, "r":"cmd-uuid", "d":{ "name":"MESSAGE_UPDATE", "message_id":"uuid", "content":"edit", "expected_version":1 } }
{ "op":6, "r":"cmd-uuid", "d":{ "name":"TYPING_START", "channel_id":"uuid" } }
```

Response `op:7` ile aynı `r` döner. Client optimistic UI → `client_nonce` ile reconcile.

## 6. Voice / WebRTC

### 6.1 Join flow (architecture.md §2, voice-client.ts)

```
Client -> Gateway: VOICE_SIGNAL { type:"join", channel_id }
Gateway -> Media control: CONNECT/SPEAK check
Media -> Gateway: VOICE_SERVER_UPDATE { endpoint, token, ice_servers }
Client -> SFU: offer (opus send+recv)
Client <-> SFU: trickle ICE
SFU -> Gateway: VOICE_STATE_UPDATE / active speaker
```

Frontend SignalingClient:

```ts
signaling.sendVoiceSignal({ type:"join", channel_id })
signaling.sendVoiceSignal({ type:"offer", sdp })
signaling.sendVoiceSignal({ type:"answer", sdp })
signaling.sendVoiceSignal({ type:"candidate", candidate })
signaling.sendVoiceSignal({ type:"leave" })
```

### 6.2 SFU mute/camera/screen

- `mute` → `MediaStreamTrack.enabled=false` + `VOICE_SIGNAL { type:"mute", muted:true }` (gateway UI state için)
- `deafen` → `AudioEngine.remoteGain=0` (SFU'ya sinyal gerekmez)
- `camera` → `getUserMedia({video:true})` + `pc.addTrack` + renegotiation
- `screen` → `getDisplayMedia({video:true,audio:true})` + `pc.addTrack`; `track.onended` → `screenEnded` dispatch → UI güncelle

### 6.3 ICE / reconnect

- SFU candidate trickle.
- `pc.onconnectionstatechange` → `failed` → `restartIce()` → `createOffer({iceRestart:true})`.
- Gateway `HEARTBEAT` ayrı, ICE restart ayrı; birbirine karıştırma (§23).

## 7. Permissions (permissions.ts)

`CONNECT` (7) + `SPEAK` (8) + `STREAM` (9) olmadan `join` reddedilir. Kanal override sırası: GuildOwner → @everyone → rollerin OR → ADMINISTRATOR → kanal @everyone override → rollerin deny/allow agregasyonu → member override.

## 8. Client sözleşmesi (Agent B uymalı)

- Event isimlerini değiştirme: `MESSAGE_CREATE` vs birebir.
- Payload şemalarına uy: `client_nonce` UUID, `content` 1-4000 char, `channel_id` UUID.
- `service_role` asla browser'a koyma (001_initial.sql `revoke all on schema app from anon/authenticated`).
- Heartbeat `HEARTBEAT_INTERVAL_MS=20_000`, timeout 2.5x.
- Resume buffer 200 event, TTL 300s.
- WASM DSP `ns_process(inputPtr, outputPtr, frames, channels)` — yoksa passthrough + “DSP unavailable” UI.

## 9. Env

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SIGNALING_URL
VITE_GATEWAY_HTTP_URL
VITE_TURN_URL / USERNAME / CREDENTIAL
VITE_WASM_DSP_URL
```

## 10. Test

- Auth: register/login/logout/session restore.
- Chat: send/receive/edit/delete + realtime dispatch.
- Voice: join/leave/mute/camera/screen + remote participant + reconnect (airplane mode 5s).
- Network: WS disconnect → reconnecting → seq replay → READY.

Bu dosya değişirse Agent B `SignalingClient` ve `WebRTCManager` buna göre güncellenmelidir.
