import { create } from "zustand";
import { gatewayApi } from "../lib/gateway";

export interface Friend { id: string; username: string; displayName: string; avatarUrl: string | null; status: "online"|"offline"|"idle" }
interface FriendState {
  friends: Friend[];
  incoming: Array<{ id: string; from: { id: string; username: string } }>;
  outgoing: Array<{ id: string; to: { id: string; username: string } }>;
  loading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  sendRequest: (username: string) => Promise<void>;
  accept: (id: string) => Promise<void>;
  reject: (id: string) => Promise<void>;
  remove: (userId: string) => Promise<void>;
}

export const useFriendStore = create<FriendState>((set) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  loading: false,
  error: null,
  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [friends, reqs] = await Promise.all([
        gatewayApi.listFriends().catch(() => [] as Friend[]),
        gatewayApi.listFriendRequests().catch(() => ({ incoming: [], outgoing: [] })),
      ]);
      if (friends.length === 0) {
        // mock
        const mockFriends: Friend[] = [
          { id: "f1", username: "ada", displayName: "Ada", avatarUrl: null, status: "online" },
          { id: "f2", username: "mert", displayName: "Mert", avatarUrl: null, status: "idle" },
        ];
        set({ friends: mockFriends, incoming: reqs.incoming.map((r) => ({ id: r.id, from: r.from_user })), outgoing: reqs.outgoing.map((r)=>({ id:r.id, to:r.to_user })), loading: false });
      } else {
        set({
          friends: (friends as Array<{ id: string; username: string; avatar_url: string | null; status: string }>).map((f) => ({ id: f.id, username: f.username, displayName: f.username, avatarUrl: f.avatar_url, status: (f.status as Friend["status"]) ?? "offline" })),
          incoming: reqs.incoming.map((r) => ({ id: r.id, from: r.from_user })),
          outgoing: reqs.outgoing.map((r) => ({ id: r.id, to: r.to_user })),
          loading: false,
        });
      }
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  sendRequest: async (username) => {
    set({ error: null });
    try { await gatewayApi.sendFriendRequest(username); } catch (e) { set({ error: (e as Error).message }); throw e; }
  },
  accept: async (id) => {
    await gatewayApi.respondFriendRequest(id, "accept").catch(()=>{});
    set((s)=>({ incoming: s.incoming.filter((r)=>r.id!==id), friends: [...s.friends, { id: `new-${id}`, username: "newfriend", displayName:"New Friend", avatarUrl:null, status:"online"}] }));
  },
  reject: async (id) => {
    await gatewayApi.respondFriendRequest(id, "reject").catch(()=>{});
    set((s)=>({ incoming: s.incoming.filter((r)=>r.id!==id) }));
  },
  remove: async (userId) => {
    await gatewayApi.removeFriend(userId).catch(()=>{});
    set((s)=>({ friends: s.friends.filter((f)=>f.id!==userId) }));
  },
}));
