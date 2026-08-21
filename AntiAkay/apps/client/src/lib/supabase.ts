import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

export function requireSupabase(): SupabaseClient {
  const c = getSupabase();
  if (!c) throw new Error("Supabase not configured. Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
  return c;
}

// Abstraction over Supabase Auth so UI never imports createClient directly.
// Maps to: register / login / logout / session restore / password reset / user identity
export const supabaseAuth = {
  async signUp(email: string, password: string, username: string) {
    const sb = requireSupabase();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { username, display_name: username } },
    });
    if (error) throw error;
    return data;
  },
  async signIn(email: string, password: string) {
    const sb = requireSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  async signOut() {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  },
  async resetPassword(email: string) {
    const sb = requireSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    if (error) throw error;
  },
  async updatePassword(newPassword: string) {
    const sb = requireSupabase();
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },
  async getSession() {
    const sb = getSupabase();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  onAuthStateChange(callback: (session: unknown) => void) {
    const sb = getSupabase();
    if (!sb) return { data: { subscription: { unsubscribe() {} } } };
    return sb.auth.onAuthStateChange((_event, session) => callback(session));
  },
  async getAccessToken(): Promise<string | null> {
    const session = await this.getSession();
    // Supabase session type guard
    const s = session as { access_token?: string } | null;
    return s?.access_token ?? null;
  },
};
