import { create } from "zustand";
import { gatewayApi } from "../lib/gateway";

export interface Guild {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId?: string;
}

interface GuildState {
  guilds: Guild[];
  activeGuildId: string | null;
  loading: boolean;
  error: string | null;
  fetchGuilds: () => Promise<void>;
  createGuild: (name: string) => Promise<Guild>;
  joinGuild: (inviteCode: string) => Promise<void>;
  setActiveGuild: (id: string | null) => void;
}

const MOCK_GUILDS: Guild[] = [
  { id: "mock-1", name: "Orbit Community", iconUrl: null, ownerId: "me" },
  { id: "mock-2", name: "Gaming Hub", iconUrl: null, ownerId: "me" },
];

export const useGuildStore = create<GuildState>((set, get) => ({
  guilds: [],
  activeGuildId: localStorage.getItem("orbit_active_guild"),
  loading: false,
  error: null,

  fetchGuilds: async () => {
    set({ loading: true, error: null });
    try {
      const data = await gatewayApi.listGuilds().catch(() => null);
      if (data && data.length > 0) {
        const mapped = data.map((g) => ({ id: g.id, name: g.name, iconUrl: g.icon_url, ownerId: g.owner_id }));
        set({ guilds: mapped, loading: false });
        if (!get().activeGuildId && mapped.length > 0) {
          const first = mapped[0].id;
          localStorage.setItem("orbit_active_guild", first);
          set({ activeGuildId: first });
        }
      } else {
        // fallback to mock for local dev without gateway
        const stored = localStorage.getItem("orbit_mock_guilds");
        const guilds = stored ? (JSON.parse(stored) as Guild[]) : MOCK_GUILDS;
        set({ guilds, loading: false });
        if (!get().activeGuildId && guilds.length > 0) {
          const first = guilds[0].id;
          localStorage.setItem("orbit_active_guild", first);
          set({ activeGuildId: first });
        }
      }
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createGuild: async (name) => {
    try {
      const res = await gatewayApi.createGuild(name);
      const guild: Guild = { id: res.id, name: res.name, iconUrl: null };
      set((s) => {
        const next = [...s.guilds, guild];
        localStorage.setItem("orbit_mock_guilds", JSON.stringify(next));
        localStorage.setItem("orbit_active_guild", guild.id);
        return { guilds: next, activeGuildId: guild.id };
      });
      // try gateway already did it, if not we already stored mock
      return guild;
    } catch {
      const guild: Guild = { id: crypto.randomUUID(), name, iconUrl: null, ownerId: "me" };
      set((s) => {
        const next = [...s.guilds, guild];
        localStorage.setItem("orbit_mock_guilds", JSON.stringify(next));
        localStorage.setItem("orbit_active_guild", guild.id);
        return { guilds: next, activeGuildId: guild.id };
      });
      return guild;
    }
  },

  joinGuild: async (inviteCode) => {
    try {
      const res = await gatewayApi.joinGuild(inviteCode);
      // fetch again
      await get().fetchGuilds();
      set({ activeGuildId: res.id });
      localStorage.setItem("orbit_active_guild", res.id);
    } catch (e) {
      throw e;
    }
  },

  setActiveGuild: (id) => {
    if (id) localStorage.setItem("orbit_active_guild", id);
    else localStorage.removeItem("orbit_active_guild");
    set({ activeGuildId: id });
  },
}));
