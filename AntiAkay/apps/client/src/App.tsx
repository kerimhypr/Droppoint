import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "./stores/auth-store";
import { LoginPage } from "./features/auth/LoginPage";
import { RegisterPage } from "./features/auth/RegisterPage";
import { ResetPasswordPage } from "./features/auth/ResetPasswordPage";
import { ChatView } from "./features/chat/ChatView";
import { FriendsPage } from "./features/friends/FriendsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { ServerSidebar } from "./components/layout/ServerSidebar";
import { ChannelSidebar } from "./components/layout/ChannelSidebar";
import { MembersPanel } from "./components/layout/MembersPanel";
import { VoiceBar } from "./features/voice/VoiceBar";
import { useGuildStore } from "./stores/guild-store";
import { useChannelStore } from "./stores/channel-store";
import { useVoiceStore } from "./stores/voice-store";
import { signalingClient } from "./services/signaling/signaling-client";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initialized, loading } = useAuthStore();
  if (!initialized || loading) return <div className="grid h-screen place-items-center bg-slate-950 text-slate-400">Yükleniyor…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, initialized, loading } = useAuthStore();
  if (!initialized || loading) return <div className="grid h-screen place-items-center bg-slate-950 text-slate-400">Yükleniyor…</div>;
  if (user) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function ShellLayout() {
  const { user } = useAuthStore();
  const { guilds, activeGuildId, fetchGuilds } = useGuildStore();
  const { channels, fetchChannels } = useChannelStore();
  const voice = useVoiceStore();
  const nav = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showMembers, setShowMembers] = useState(true);

  useEffect(() => { if (user) void fetchGuilds(); }, [user, fetchGuilds]);
  useEffect(() => { if (activeGuildId) void fetchChannels(activeGuildId); }, [activeGuildId, fetchChannels]);
  useEffect(() => {
    if (user && signalingClient.connectionState==="disconnected") void signalingClient.connect().catch(()=>{});
  }, [user]);

  const activeGuild = guilds.find((g)=>g.id===activeGuildId) ?? null;
  const isSettings = location.pathname.startsWith("/app/settings");
  const isFriends = location.pathname.startsWith("/app/friends");

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <ServerSidebar guilds={guilds} activeGuildId={activeGuildId} />

      <div className={`${mobileOpen ? "fixed inset-y-0 left-20 z-40 flex" : "hidden md:flex"} w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900`}>
        {isSettings || isFriends ? (
          <div className="flex h-full flex-col p-4">
            <nav className="space-y-1">
              <button onClick={()=>nav("/app")} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${!isFriends && !isSettings ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800"}`}># Sohbet</button>
              <button onClick={()=>nav("/app/friends")} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${isFriends ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800"}`}>Arkadaşlar</button>
              <button onClick={()=>nav("/app/settings")} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${isSettings ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800"}`}>Ayarlar</button>
            </nav>
            <div className="mt-auto border-t border-slate-800 pt-3">
              <VoiceBar />
              <UserPanel />
            </div>
          </div>
        ) : (
          <>
            <ChannelSidebar guild={activeGuild} channels={channels} onCloseMobile={()=>setMobileOpen(false)} />
            <div className="mt-auto border-t border-slate-800">
              <VoiceBar />
              <UserPanel />
            </div>
          </>
        )}
      </div>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-black/40 md:hidden" aria-label="close" onClick={()=>setMobileOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-900/70 px-3">
          <button className="rounded-lg p-2 hover:bg-slate-800 md:hidden" onClick={()=>setMobileOpen(v=>!v)} aria-label="menu">
            <span className="block h-0.5 w-5 bg-slate-300" /><span className="mt-1 block h-0.5 w-5 bg-slate-300" /><span className="mt-1 block h-0.5 w-5 bg-slate-300" />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold">
            {isFriends ? "Arkadaşlar" : isSettings ? "Ayarlar" : (channels.find((c)=>c.id===useChannelStore.getState().activeChannelId)?.name ? `# ${channels.find((c)=>c.id===useChannelStore.getState().activeChannelId)?.name}` : activeGuild?.name ?? "Orbit")}
          </div>
          <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium md:inline-flex ${voice.state==="connected" ? "bg-emerald-500/15 text-emerald-300" : voice.state==="connecting"||voice.state==="reconnecting" ? "bg-amber-500/15 text-amber-300" : "bg-slate-800 text-slate-400"}`}>
            <span className={`h-2 w-2 rounded-full ${voice.state==="connected" ? "bg-emerald-400" : voice.state==="connecting"||voice.state==="reconnecting" ? "bg-amber-400 animate-pulse" : "bg-slate-600"}`} />
            {voice.state==="connected" ? "Voice connected" : voice.state==="connecting" ? "Connecting" : voice.state==="reconnecting" ? "Reconnecting" : voice.state==="failed" ? "Voice failed" : "Gateway"}
          </span>
          {!isSettings && !isFriends && (
            <button onClick={()=>setShowMembers(v=>!v)} className="hidden rounded-lg p-2 text-slate-400 hover:bg-slate-800 md:inline-flex" aria-label="members">👥</button>
          )}
        </header>
        <div className="flex min-w-0 flex-1 overflow-hidden">
          <main className="min-w-0 flex-1 overflow-hidden bg-slate-950">
            <Outlet />
          </main>
          {!isSettings && !isFriends && showMembers && (
            <aside className="hidden w-60 shrink-0 border-l border-slate-800 bg-slate-900/40 xl:block">
              <MembersPanel />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function UserPanel() {
  const { user, signOut } = useAuthStore();
  const voice = useVoiceStore();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 bg-slate-950 px-3 py-3">
      <div className="grid h-8 w-8 place-items-center rounded-full bg-indigo-600 text-sm font-bold">{(user.displayName ?? user.username ?? user.email ?? "U")[0].toUpperCase()}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{user.displayName ?? user.username}</div>
        <div className="text-xs text-slate-400">{voice.muted ? "🔇 Sessiz" : voice.state==="connected" ? "● Ses" : "Çevrimiçi"}</div>
      </div>
      <button onClick={()=>void signOut()} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Çıkış">⎋</button>
    </div>
  );
}

import { useState } from "react";

export function App() {
  const { initialize } = useAuthStore();
  useEffect(()=>{ void initialize(); },[initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
        <Route path="/reset-password" element={<GuestOnly><ResetPasswordPage /></GuestOnly>} />

        <Route path="/app" element={<RequireAuth><ShellLayout /></RequireAuth>}>
          <Route index element={<ChatView />} />
          <Route path="friends" element={<FriendsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<div className="grid h-screen place-items-center bg-slate-950 text-slate-400">404 — Sayfa bulunamadı</div>} />
      </Routes>
    </BrowserRouter>
  );
}
