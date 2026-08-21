import { create } from "zustand";
import { supabaseAuth, getSupabase } from "../lib/supabase";

export type AuthUser = { id: string; email?: string; username?: string; displayName?: string; avatarUrl?: string | null };

interface AuthState {
  user: AuthUser | null;
  session: unknown | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  initialize: () => Promise<void>;
  setUser: (u: AuthUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,
  error: null,

  setUser: (user) => set({ user }),

  initialize: async () => {
    set({ loading: true });
    try {
      const sb = getSupabase();
      if (!sb) {
        // mock mode for development without supabase
        const mock = localStorage.getItem("orbit_mock_user");
        if (mock) {
          set({ user: JSON.parse(mock), session: { access_token: "mock" }, loading: false, initialized: true });
          return;
        }
        set({ user: null, session: null, loading: false, initialized: true });
        return;
      }
      const session = await supabaseAuth.getSession();
      if (session) {
        const s = session as { user?: { id: string; email?: string; user_metadata?: { username?: string; display_name?: string; avatar_url?: string } } };
        set({
          session,
          user: s.user ? { id: s.user.id, email: s.user.email, username: s.user.user_metadata?.username, displayName: s.user.user_metadata?.display_name, avatarUrl: s.user.user_metadata?.avatar_url ?? null } : null,
          loading: false,
          initialized: true,
        });
      } else {
        set({ session: null, user: null, loading: false, initialized: true });
      }
      supabaseAuth.onAuthStateChange((session) => {
        const s = session as { user?: { id: string; email?: string; user_metadata?: Record<string,string> } } | null;
        if (s?.user) {
          set({ session: s, user: { id: s.user.id, email: s.user.email, username: s.user.user_metadata?.username, displayName: s.user.user_metadata?.display_name, avatarUrl: s.user.user_metadata?.avatar_url ?? null }, loading: false, initialized: true });
        } else {
          set({ session: null, user: null, loading: false, initialized: true });
        }
      });
    } catch (e) {
      set({ error: (e as Error).message, loading: false, initialized: true });
    }
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const sb = getSupabase();
      if (!sb) {
        // mock auth
        if (!email || !password) throw new Error("Email and password required");
        const mockUser = { id: crypto.randomUUID(), email, username: email.split("@")[0], displayName: email.split("@")[0] };
        localStorage.setItem("orbit_mock_user", JSON.stringify(mockUser));
        localStorage.setItem("orbit_mock_token", "mock-token");
        set({ user: mockUser, session: { access_token: "mock" }, loading: false });
        return;
      }
      const { user } = (await supabaseAuth.signIn(email, password) as { user?: { id:string; email?:string; user_metadata?: Record<string,string> } });
      if (user) set({ user: { id: user.id, email: user.email, username: user.user_metadata?.username, displayName: user.user_metadata?.display_name }, loading: false });
      else set({ loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  signUp: async (email, password, username) => {
    set({ loading: true, error: null });
    try {
      const sb = getSupabase();
      if (!sb) {
        const mockUser = { id: crypto.randomUUID(), email, username, displayName: username };
        localStorage.setItem("orbit_mock_user", JSON.stringify(mockUser));
        set({ user: mockUser, session: { access_token: "mock" }, loading: false });
        return;
      }
      await supabaseAuth.signUp(email, password, username);
      set({ loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  signOut: async () => {
    await supabaseAuth.signOut();
    localStorage.removeItem("orbit_mock_user");
    localStorage.removeItem("orbit_mock_token");
    localStorage.removeItem("orbit_session");
    set({ user: null, session: null });
  },

  resetPassword: async (email) => {
    const sb = getSupabase();
    if (!sb) throw new Error("Password reset requires Supabase configuration");
    await supabaseAuth.resetPassword(email);
  },
}));
