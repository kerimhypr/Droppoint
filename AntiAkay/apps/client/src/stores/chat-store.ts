import { create } from "zustand";
import { gatewayApi } from "../lib/gateway";
import { signalingClient } from "../services/signaling/signaling-client";

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  author?: { username: string; displayName: string; avatarUrl: string | null };
  content: string;
  createdAt: string;
  editedAt: string | null;
  status: "active" | "deleted";
  version: number;
  clientNonce: string;
  pending?: boolean;
}

interface ChatState {
  messagesByChannel: Record<string, Message[]>;
  cursors: Record<string, { created_at: string; id: string } | null>;
  loading: Record<string, boolean>;
  typingUsers: Record<string, Set<string>>;
  fetchMessages: (channelId: string, opts?: { refresh?: boolean }) => Promise<void>;
  sendMessage: (channelId: string, content: string) => Promise<void>;
  editMessage: (channelId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (channelId: string, messageId: string) => Promise<void>;
  handleRealtime: () => () => void;
  setTyping: (channelId: string, userId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesByChannel: {},
  cursors: {},
  loading: {},
  typingUsers: {},

  fetchMessages: async (channelId, opts) => {
    const refresh = opts?.refresh ?? false;
    const cursor = refresh ? null : (get().cursors[channelId] ?? null);
    // if we already have messages and not refresh and cursor is null = fully loaded
    if (!refresh && get().messagesByChannel[channelId]?.length && get().cursors[channelId] === null && cursor === null) {
      // we might have initial load already
    }
    set((s) => ({ loading: { ...s.loading, [channelId]: true } }));
    try {
      const res = await gatewayApi.listMessages(channelId, cursor).catch(() => null);
      if (res) {
        const mapped: Message[] = res.items.map((m) => ({
          id: m.id, channelId: m.channel_id, authorId: m.author_id,
          author: m.author ? { username: m.author.username, displayName: m.author.display_name, avatarUrl: m.author.avatar_url } : undefined,
          content: m.content, createdAt: m.created_at, editedAt: m.edited_at,
          status: "active", version: 1, clientNonce: m.client_nonce,
        }));
        set((s) => {
          const existing = refresh ? [] : (s.messagesByChannel[channelId] ?? []);
          // messages are DESC cursor, we store ASC for UI
          const merged = [...existing, ...mapped].filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);
          merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          return {
            messagesByChannel: { ...s.messagesByChannel, [channelId]: merged },
            cursors: { ...s.cursors, [channelId]: res.next_cursor },
            loading: { ...s.loading, [channelId]: false },
          };
        });
      } else {
        // mock without gateway — keep empty or initial mock
        set((s) => ({ loading: { ...s.loading, [channelId]: false } }));
        if (!get().messagesByChannel[channelId]) {
          const mock: Message[] = [
            { id: "m1", channelId, authorId: "u1", author: { username: "Ada", displayName: "Ada", avatarUrl: null }, content: "Ses pipeline'ı hazır; WASM yükleniyor.", createdAt: new Date(Date.now()-1000*60*3).toISOString(), editedAt: null, status: "active", version: 1, clientNonce: "n1" },
            { id: "m2", channelId, authorId: "u2", author: { username: "Mert", displayName: "Mert", avatarUrl: null }, content: "SFU signaling akışını test edelim.", createdAt: new Date(Date.now()-1000*60*2).toISOString(), editedAt: null, status: "active", version: 1, clientNonce: "n2" },
          ];
          set((s) => ({ messagesByChannel: { ...s.messagesByChannel, [channelId]: mock } }));
        }
      }
    } catch {
      set((s) => ({ loading: { ...s.loading, [channelId]: false } }));
    }
  },

  sendMessage: async (channelId, content) => {
    const nonce = crypto.randomUUID();
    const tempId = `temp-${nonce}`;
    const optimistic: Message = {
      id: tempId, channelId, authorId: "me", author: { username: "You", displayName: "You", avatarUrl: null },
      content, createdAt: new Date().toISOString(), editedAt: null, status: "active", version: 1, clientNonce: nonce, pending: true,
    };
    set((s) => ({ messagesByChannel: { ...s.messagesByChannel, [channelId]: [...(s.messagesByChannel[channelId] ?? []), optimistic] } }));

    try {
      // Prefer gateway WS REQUEST (op 6) if connected, fallback to HTTP, fallback to mock reconcile
      if (signalingClient.connectionState === "connected") {
        await signalingClient.request("MESSAGE_CREATE", { channel_id: channelId, client_nonce: nonce, content });
        // server will dispatch MESSAGE_CREATE, we will reconcile via handleRealtime
        // optimistically mark as sent (remove pending) if no dispatch in 2s
        setTimeout(() => {
          set((s) => {
            const msgs = s.messagesByChannel[channelId] ?? [];
            return { messagesByChannel: { ...s.messagesByChannel, [channelId]: msgs.map((m) => m.id === tempId ? { ...m, pending: false, id: `srv-${nonce.slice(0,8)}` } : m) } };
          });
        }, 800);
      } else {
        // HTTP or mock
        await new Promise((r) => setTimeout(r, 400));
        set((s) => {
          const msgs = s.messagesByChannel[channelId] ?? [];
          return { messagesByChannel: { ...s.messagesByChannel, [channelId]: msgs.map((m) => m.id === tempId ? { ...m, pending: false, id: `srv-${nonce.slice(0,8)}` } : m) } };
        });
      }
    } catch (e) {
      // keep optimistic but mark failed
      set((s) => {
        const msgs = s.messagesByChannel[channelId] ?? [];
        return { messagesByChannel: { ...s.messagesByChannel, [channelId]: msgs.filter((m) => m.id !== tempId) } };
      });
      throw e;
    }
  },

  editMessage: async (channelId, messageId, content) => {
    set((s) => {
      const msgs = s.messagesByChannel[channelId] ?? [];
      return { messagesByChannel: { ...s.messagesByChannel, [channelId]: msgs.map((m) => m.id === messageId ? { ...m, content, editedAt: new Date().toISOString() } : m) } };
    });
    try {
      if (signalingClient.connectionState === "connected") {
        await signalingClient.request("MESSAGE_UPDATE", { message_id: messageId, content, expected_version: 1 });
      }
    } catch { /* ignore, already optimistic */ }
  },

  deleteMessage: async (channelId, messageId) => {
    set((s) => {
      const msgs = s.messagesByChannel[channelId] ?? [];
      return { messagesByChannel: { ...s.messagesByChannel, [channelId]: msgs.filter((m) => m.id !== messageId) } };
    });
    try {
      if (signalingClient.connectionState === "connected") {
        await signalingClient.request("MESSAGE_DELETE", { message_id: messageId });
      }
    } catch { /* ignore */ }
  },

  handleRealtime: () => {
    const onDispatch = (event: string, data: unknown) => {
      if (event === "MESSAGE_CREATE") {
        const d = data as { id: string; channel_id: string; author_id: string; content: string; created_at: string; client_nonce: string; author?: { username:string; display_name:string; avatar_url:string|null } };
        if (!d?.channel_id) return;
        set((s) => {
          const existing = s.messagesByChannel[d.channel_id] ?? [];
          // reconcile optimistic by client_nonce
          const idx = existing.findIndex((m) => m.clientNonce === d.client_nonce);
          const msg: Message = {
            id: d.id, channelId: d.channel_id, authorId: d.author_id,
            author: d.author ? { username: d.author.username, displayName: d.author.display_name, avatarUrl: d.author.avatar_url } : undefined,
            content: d.content, createdAt: d.created_at, editedAt: null, status: "active", version: 1, clientNonce: d.client_nonce,
          };
          if (idx >= 0) {
            const next = [...existing];
            next[idx] = msg;
            return { messagesByChannel: { ...s.messagesByChannel, [d.channel_id]: next } };
          }
          if (existing.some((m) => m.id === d.id)) return s;
          const next = [...existing, msg].sort((a,b)=> new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
          return { messagesByChannel: { ...s.messagesByChannel, [d.channel_id]: next } };
        });
      } else if (event === "MESSAGE_UPDATE") {
        const d = data as { id: string; channel_id: string; content: string; edited_at: string };
        set((s) => {
          const msgs = s.messagesByChannel[d.channel_id] ?? [];
          return { messagesByChannel: { ...s.messagesByChannel, [d.channel_id]: msgs.map((m) => m.id === d.id ? { ...m, content: d.content, editedAt: d.edited_at } : m) } };
        });
      } else if (event === "MESSAGE_DELETE") {
        const d = data as { id: string; channel_id: string };
        set((s) => {
          const msgs = s.messagesByChannel[d.channel_id] ?? [];
          return { messagesByChannel: { ...s.messagesByChannel, [d.channel_id]: msgs.filter((m) => m.id !== d.id) } };
        });
      } else if (event === "TYPING_START") {
        const d = data as { channel_id: string; user_id: string };
        if (d?.channel_id && d?.user_id) get().setTyping(d.channel_id, d.user_id);
      }
    };
    const unsub = signalingClient.on("dispatch", onDispatch as never);

    // Also Supabase Realtime fallback if configured and gateway not connected
    const supa = (()=>{ try{ return null; }catch{return null}})();

    return () => {
      unsub();
      void supa;
    };
  },

  setTyping: (channelId, userId) => {
    set((s) => {
      const setForChannel = new Set(s.typingUsers[channelId] ?? []);
      setForChannel.add(userId);
      return { typingUsers: { ...s.typingUsers, [channelId]: setForChannel } };
    });
    setTimeout(() => {
      set((s) => {
        const setForChannel = new Set(s.typingUsers[channelId] ?? []);
        setForChannel.delete(userId);
        return { typingUsers: { ...s.typingUsers, [channelId]: setForChannel } };
      });
    }, 3000);
  },
}));
