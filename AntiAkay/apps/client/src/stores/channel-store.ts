import { create } from "zustand";
import { gatewayApi } from "../lib/gateway";

export type ChannelKind = "category" | "text" | "voice";
export interface Channel {
  id: string;
  guildId: string;
  name: string;
  kind: ChannelKind;
  parentId: string | null;
  position: number;
  topic?: string | null;
}

interface ChannelState {
  channels: Channel[];
  activeChannelId: string | null;
  loading: boolean;
  fetchChannels: (guildId: string) => Promise<void>;
  setActiveChannel: (id: string | null) => void;
  createChannel: (guildId: string, name: string, kind: ChannelKind) => Promise<void>;
}

function mockChannels(guildId: string): Channel[] {
  return [
    { id: `mock-${guildId}-1`, guildId, name: "genel", kind: "text", parentId: null, position: 0, topic: "Genel sohbet" },
    { id: `mock-${guildId}-2`, guildId, name: "duyurular", kind: "text", parentId: null, position: 1 },
    { id: `mock-${guildId}-3`, guildId, name: "toplantı", kind: "voice", parentId: null, position: 2 },
    { id: `mock-${guildId}-4`, guildId, name: "oyun", kind: "voice", parentId: null, position: 3 },
  ];
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  activeChannelId: localStorage.getItem("orbit_active_channel"),
  loading: false,

  fetchChannels: async (guildId) => {
    set({ loading: true });
    try {
      const data = await gatewayApi.listChannels(guildId).catch(() => null);
      if (data) {
        const mapped: Channel[] = data.map((c) => ({ id: c.id, guildId: c.guild_id, name: c.name, kind: c.kind as ChannelKind, parentId: c.parent_id, position: c.position }));
        set({ channels: mapped, loading: false });
        const active = get().activeChannelId;
        if (!active || !mapped.some((c) => c.id === active)) {
          const firstText = mapped.find((c) => c.kind === "text")?.id ?? mapped[0]?.id ?? null;
          if (firstText) {
            localStorage.setItem("orbit_active_channel", firstText);
            set({ activeChannelId: firstText });
          }
        }
      } else {
        const mocks = mockChannels(guildId);
        set({ channels: mocks, loading: false });
        const firstText = mocks.find((c) => c.kind === "text")?.id ?? mocks[0]?.id ?? null;
        if (firstText && !get().activeChannelId) {
          localStorage.setItem("orbit_active_channel", firstText);
          set({ activeChannelId: firstText });
        }
      }
    } catch {
      const mocks = mockChannels(guildId);
      set({ channels: mocks, loading: false });
    }
  },

  setActiveChannel: (id) => {
    if (id) localStorage.setItem("orbit_active_channel", id);
    set({ activeChannelId: id });
  },

  createChannel: async (guildId, name, kind) => {
    try {
      await gatewayApi.createChannel(guildId, { name, kind: kind as "text" | "voice" });
      await get().fetchChannels(guildId);
    } catch {
      // mock fallback
      const ch: Channel = { id: crypto.randomUUID(), guildId, name, kind, parentId: null, position: get().channels.length };
      set((s) => ({ channels: [...s.channels, ch] }));
    }
  },
}));
