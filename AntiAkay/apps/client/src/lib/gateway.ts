// Gateway HTTP abstraction — mirrors WS REQUEST opcode handlers.
// UI never talks to DB directly; gateway is the auth boundary (architecture.md §1, §4)

import { env } from "./env";
import { supabaseAuth } from "./supabase";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

async function request<T>(path: string, method: HttpMethod = "GET", body?: unknown): Promise<T> {
  const token = await supabaseAuth.getAccessToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${env.gatewayHttpUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    throw new Error((json as { message?: string })?.message ?? text ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const gatewayApi = {
  // guilds => servers in spec
  listGuilds: () => request<Array<{ id: string; name: string; icon_url: string | null; owner_id: string }>>("/api/guilds"),
  createGuild: (name: string) => request<{ id: string; name: string }>("/api/guilds", "POST", { name }),
  joinGuild: (inviteCode: string) => request<{ id: string }>("/api/guilds/join", "POST", { invite_code: inviteCode }),
  leaveGuild: (guildId: string) => request<void>(`/api/guilds/${guildId}/members/@me`, "DELETE"),
  listChannels: (guildId: string) => request<Array<{ id: string; guild_id: string; name: string; kind: "category"|"text"|"voice"; parent_id: string|null; position:number }>>(`/api/guilds/${guildId}/channels`),
  createChannel: (guildId: string, payload: { name: string; kind: "text"|"voice"; parent_id?: string|null }) => request<{ id:string }>("/api/guilds/"+guildId+"/channels","POST",payload),
  listMessages: (channelId: string, cursor?: { created_at: string; id: string } | null, limit=50) => {
    const qs = new URLSearchParams();
    if (cursor) { qs.set("after_created_at", cursor.created_at); qs.set("after_id", cursor.id); }
    qs.set("limit", String(limit));
    return request<{ items: Array<{ id:string; channel_id:string; author_id:string; content:string; created_at:string; edited_at:string|null; client_nonce:string; author?:{ username:string; display_name:string; avatar_url:string|null } }>; next_cursor: { created_at:string; id:string }|null }>(`/api/channels/${channelId}/messages?${qs.toString()}`);
  },
  // Friends (supabase tables: friends, friend_requests)
  listFriends: () => request<Array<{ id:string; username:string; display_name:string; avatar_url:string|null; status:string }>>("/api/friends"),
  listFriendRequests: () => request<{ incoming: Array<{ id:string; from_user:{ id:string; username:string} }>; outgoing: Array<{ id:string; to_user:{id:string; username:string} }> }>("/api/friends/requests"),
  sendFriendRequest: (username: string) => request<void>("/api/friends/requests","POST",{ username }),
  respondFriendRequest: (requestId: string, action: "accept"|"reject") => request<void>(`/api/friends/requests/${requestId}`,"PATCH",{ action }),
  removeFriend: (userId: string) => request<void>(`/api/friends/${userId}`,"DELETE"),
};
