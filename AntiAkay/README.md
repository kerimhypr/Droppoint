# Browser-native Discord architecture reference

Bu repo, React/Vite/TypeScript istemcisi, WebSocket gateway, PostgreSQL + Redis state katmanı ve WebRTC SFU için üretime dönük bir referans iskeletidir.

## Başlangıç

```text
docs/architecture.md                 Sistem tasarımı, akışlar ve operasyon notları
db/migrations/001_initial.sql        PostgreSQL şeması ve Supabase güvenlik sınırı
packages/contracts/src/               Gateway opcode/event sözleşmeleri ve izinler
apps/gateway/src/                     WebSocket gateway çekirdeği
apps/client/src/audio/                AudioWorklet + WASM + WebRTC ses hattı
render.yaml                           Gateway/frontend/DB/Redis için Render Blueprint
```

Bu iskelet, örnek entegrasyon noktalarını ve güvenli varsayılanları içerir; gerçek auth sağlayıcısı, WASM DSP binary’si, SFU deployment’ı ve secret yönetimi ortama göre bağlanmalıdır.

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm build
```

Detaylı kararlar için [docs/architecture.md](docs/architecture.md) dosyasına bakın.
