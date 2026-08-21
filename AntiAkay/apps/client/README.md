# Orbit Client — Agent B (Frontend / Supabase / Client WebRTC)

Discord'dan ilham alan modern communication platform — Agent A gateway/SFU kontratına birebir entegre.

## Stack

- React 19 + Vite + TypeScript + Tailwind
- React Router 7 (protected routes + session restore)
- Supabase JS 2 (`VITE_SUPABASE_URL/ANON_KEY` — service_role asla cliente gitmez)
- Zustand (auth/guild/channel/chat/voice/friend stores — ayrı katmanlar, tek store'a yığma yok)
- WebSocket SignalingClient + WebRTCManager (browser `RTCPeerConnection`, `getUserMedia`, `getDisplayMedia`)

## Mimari (UI → State → Services → Supabase/Signaling/WebRTC)

```
UI (features/*, components/*)
 ↓
Application State (stores/* — zustand, ayrı slice'lar)
 ↓
Feature Services (services/signaling, services/webrtc, lib/gateway, lib/supabase)
 ↓
Supabase Auth / Gateway HTTP & WS / Browser WebRTC
```

## Kurulum

```bash
pnpm install
cp .env.example .env
# doldur: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SIGNALING_URL=wss://.../gateway
pnpm --filter @clone/contracts build
pnpm --filter @clone/client dev   # http://localhost:5173
pnpm --filter @clone/client build # production
```

## Env

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SIGNALING_URL=wss://orbit-gateway.onrender.com/gateway
VITE_GATEWAY_HTTP_URL=https://orbit-gateway.onrender.com
VITE_TURN_URL / USERNAME / CREDENTIAL
VITE_WASM_DSP_URL=/wasm/noise-suppression.wasm
```

## Rotalar

- `/login` `/register` `/reset-password` — GuestOnly, form validation + loading/error + Supabase Auth
- `/app` — RequireAuth, ShellLayout (Server Rail + Channel Sidebar + Main + Members)
- `/app/friends` — incoming/outgoing/accept/reject/remove/block
- `/app/settings` — avatar/username/status/account/profile/appearance

## Auth akışı

`initialize()` → `getSession()` → `onAuthStateChange` → `user` store. Sayfa yenilenmede session kaybolmaz, loading sırasında login flash yok, unauthorized `/app`'e giremez.

## Signaling (AGENT_A_STATUS.md kontratı)

- `SignalingClient` opcode 0..11 birebir uygular (HELLO, HEARTBEAT, IDENTIFY, RESUME, DISPATCH, REQUEST, VOICE_SIGNAL…).
- `authenticate()` Supabase access_token ile IDENTIFY/RESUME, `session_id+seq` localStorage'da, 4006'da sil.
- Heartbeat 20s, reconnect exponential backoff (max 15s) + 4004/4003'te dur.
- UI doğrudan WS ile uğraşmaz; `on("dispatch")`, `on("ready")`, `request()` abstraction kullanır.

## WebRTC

- `WebRTCManager` `RTCPeerConnection` (bundle/max-bundle, stun+turn), `ontrack` → `remoteTrack`, `onicecandidate` → trickle, `restartIce()` on `failed`.
- `joinVoice(channelId)` → `getUserMedia` → `addTrack` → `VOICE_SIGNAL join` + offer.
- `startCamera()` / `stopCamera()` → `getUserMedia({video})` + renegotiation.
- `startScreenShare()` → `getDisplayMedia` + `track.onended` → `screenEnded` → UI güncelle.
- `setMicrophoneEnabled(enabled)` → `track.enabled`; `AudioEngine.setMuted/Deafened` → gain 0 (sfu'ya ek sinyal `VOICE_SIGNAL {type:"mute"}`).

## Voice UI

Tıklama → mic permission → signaling connect → authenticate → join room → publish → remote participants. Ayrılırken tüm track/streams/PC temizlenir, unmount'ta da.

Kontroller: mute/unmute, deafen (remoteGain 0), speaking (RMS > -48 db via AudioWorklet LEVEL 20-25Hz), participant kartlarında username/avatar/mic/cam/screen/connection.

## Chat

- `gatewayApi.listMessages` cursor pagination (`created_at DESC, id DESC`), `client_nonce` idempotency.
- `signalingClient.request("MESSAGE_CREATE")` optimistic + `MESSAGE_CREATE/UPDATE/DELETE` dispatch reconcile.
- `TYPING_START` throttle, 3s sonra temizlenir.
- Long list virtual değil ama pagination + `overflow-y-auto` + `filter` dedup ile render korunur.

## Performans & A11y

- Zustand slice'larla her WS eventinde tüm app render olmaz.
- Semantic HTML, `aria-label`, `aria-live="polite"` chat, `focus-visible:ring`, keyboard Enter/Shift+Enter.

## Supabase / RLS

- `db/migrations/001_initial.sql` — `app` schema gateway-owned, `revoke all from anon/authenticated`, RLS enabled (browser'a kapalı).
- `db/migrations/002_supabase_rls_friends_profiles.sql` — opsiyonel `public` tablolar için explicit RLS policies (profile self-update, friend_requests from/to check, server member/owner checks). `service_role` asla env'de cliente gitmez.

## Test (manuel checklist)

- [ ] register → login → refresh → logout → session restore
- [ ] server create/join/switch
- [ ] channel create text/voice
- [ ] message send/edit/delete + realtime diğer sekmede
- [ ] friend add/accept/reject/remove
- [ ] voice join → mic mute/unmute → remote duyuluyor mu → camera on/off → screen share start/stop + remote görüyor mu
- [ ] uçak modu 5s → reconnecting → re-joined + seq replay
- [ ] mic/ camera reddedildiğinde friendly error (teknik stack trace yok)

## Agent A ile uyum

`AGENT_A_STATUS.md` + `docs/architecture.md` §5 + `packages/contracts` — opcode, event, payload, close code, room lifecycle birebir aynı. Değişirse `SignalingClient`/`WebRTCManager` güncellenmeli.
