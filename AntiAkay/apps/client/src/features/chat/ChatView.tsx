import { useEffect, useRef, useState } from "react";
import { useChannelStore } from "../../stores/channel-store";
import { useChatStore } from "../../stores/chat-store";
import { signalingClient } from "../../services/signaling/signaling-client";
import { Button } from "../../components/ui/button";

export function ChatView() {
  const { activeChannelId, channels } = useChannelStore();
  const { messagesByChannel, fetchMessages, sendMessage, editMessage, deleteMessage, handleRealtime, typingUsers } = useChatStore();
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const channel = channels.find((c)=>c.id===activeChannelId) ?? null;
  const messages = activeChannelId ? (messagesByChannel[activeChannelId] ?? []) : [];
  const typing = activeChannelId ? (typingUsers[activeChannelId] ?? new Set()) : new Set();

  useEffect(() => {
    if (!activeChannelId) return;
    void fetchMessages(activeChannelId, { refresh: true });
    const unsub = handleRealtime();
    return unsub;
  }, [activeChannelId, fetchMessages, handleRealtime]);

  useEffect(() => {
    // auto scroll to bottom on new messages
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChannelId || !input.trim()) return;
    const content = input.trim();
    setInput("");
    try {
      await sendMessage(activeChannelId, content);
    } catch {
      // already handled optimistically
    }
  }

  function onTyping() {
    if (!activeChannelId) return;
    // throttle via signaling REQUEST
    try { void signalingClient.request("TYPING_START", { channel_id: activeChannelId }); } catch { /* */ }
  }

  if (!activeChannelId) {
    return <div className="grid h-full place-items-center p-8 text-center text-slate-400"><div><p className="text-lg font-semibold">Bir kanal seç</p><p className="mt-1 text-sm">Sohbete başlamak için sol taraftan bir metin kanalı seç.</p></div></div>;
  }
  if (channel?.kind === "voice") {
    return <VoiceChannelView channelId={activeChannelId} channelName={channel.name} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-800 px-4">
        <span className="text-slate-500">#</span><span className="font-semibold">{channel?.name ?? "kanal"}</span>
        {channel?.topic && <span className="hidden truncate border-l border-slate-700 pl-3 text-sm text-slate-400 md:inline">{channel.topic}</span>}
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6" aria-live="polite">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">#{channel?.name}</h1>
          <p className="text-sm text-slate-500">Bu kanalın mesajları cursor pagination ile yüklenir. Yeni mesajlar realtime gelir.</p>
        </div>

        {messages.length===0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-6 py-12 text-center">
            <p className="font-medium text-slate-300">Henüz mesaj yok</p>
            <p className="mt-1 text-sm text-slate-500">İlk mesajı sen gönder!</p>
          </div>
        ) : (
          messages.map((m)=>(
            <article key={m.id} className={`group flex gap-3 rounded-lg px-2 py-1 hover:bg-slate-900 ${m.pending ? "opacity-60" : ""}`}>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-700 text-sm font-bold">{m.author?.displayName?.[0] ?? m.author?.username?.[0] ?? "?"}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{m.author?.displayName ?? m.author?.username ?? m.authorId.slice(0,6)}</span>
                  <time className="text-xs text-slate-500">{new Date(m.createdAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})} {m.editedAt ? "(düzenlendi)" : ""}</time>
                  {m.pending && <span className="text-xs text-amber-400">gönderiliyor...</span>}
                </div>
                {editingId===m.id ? (
                  <form onSubmit={(e)=>{ e.preventDefault(); if (!activeChannelId) return; void editMessage(activeChannelId, m.id, editContent); setEditingId(null); }} className="mt-1 flex gap-2">
                    <input value={editContent} onChange={(e)=>setEditContent(e.target.value)} className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-indigo-500" autoFocus />
                    <Button size="sm" type="submit">Kaydet</Button>
                    <Button size="sm" variant="ghost" type="button" onClick={()=>setEditingId(null)}>İptal</Button>
                  </form>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-200">{m.content}</p>
                )}
                <div className="mt-1 hidden gap-2 text-xs text-slate-500 group-hover:flex">
                  <button onClick={()=>{ setEditingId(m.id); setEditContent(m.content); }} className="hover:text-slate-300">Düzenle</button>
                  <button onClick={()=>{ if (activeChannelId) void deleteMessage(activeChannelId, m.id); }} className="hover:text-red-400">Sil</button>
                  <button onClick={()=>{ setInput(`@${m.author?.username ?? ""} `); }} className="hover:text-slate-300">Yanıtla</button>
                </div>
              </div>
            </article>
          ))
        )}

        {typing.size>0 && <div className="text-xs italic text-slate-400">{[...typing].slice(0,3).join(", ")} yazıyor...</div>}
      </div>

      <form onSubmit={onSend} className="border-t border-slate-800 p-3 md:p-4">
        <div className="flex items-end gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
          <textarea
            value={input}
            onChange={(e)=>{ setInput(e.target.value); onTyping(); }}
            onKeyDown={(e)=>{ if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); void onSend(e); } }}
            placeholder={`#${channel?.name ?? "kanal"} kanalına mesaj gönder`}
            rows={1}
            className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-slate-500"
            aria-label="Message input"
          />
          <Button type="submit" size="sm" disabled={!input.trim()} className="shrink-0">Gönder</Button>
        </div>
        <p className="mt-1 hidden text-xs text-slate-600 md:block">Enter gönderir · Shift+Enter yeni satır</p>
      </form>
    </div>
  );
}

function VoiceChannelView({ channelId, channelName }: { channelId: string; channelName: string }) {
  const voice = useVoiceStore();
  const isJoined = voice.channelId===channelId;
  const participants = voice.participants;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-2 border-b border-slate-800 px-4">
        <span className="text-emerald-400">◉</span><span className="font-semibold">{channelName}</span>
        <span className="text-sm text-slate-500">Ses kanalı — {participants.length} katılımcı</span>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {!isJoined ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <h2 className="text-xl font-bold">Ses kanalına katıl</h2>
            <p className="mt-2 text-sm text-slate-400">Mikrofon izni istenecek ve WebRTC bağlantısı kurulacak.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button onClick={()=>void voice.join(channelId).catch(()=>{})}>Sesle katıl</Button>
              <Button variant="secondary" onClick={()=>void voice.join(channelId,{video:true}).catch(()=>{})}>Kamera ile katıl</Button>
            </div>
            {voice.error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{voice.error}</p>}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {participants.map((p)=>(
                <ParticipantTile key={p.id} participant={p} isSelf={p.id==="self"} />
              ))}
              {participants.length===0 && <div className="col-span-full text-center text-slate-500">Katılımcı bekleniyor...</div>}
            </div>
            <VideoGrid />
          </>
        )}
      </div>
    </div>
  );
}

function ParticipantTile({ participant, isSelf }: { participant: { id:string; username:string; avatarUrl:string|null; muted:boolean; cameraOn:boolean; screenSharing:boolean; speaking:boolean }; isSelf: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-slate-900 p-4 ${participant.speaking ? "border-emerald-500/50 ring-2 ring-emerald-500/20" : "border-slate-800"}`}>
      <div className="flex items-center gap-3">
        <div className={`grid h-12 w-12 place-items-center rounded-full text-lg font-bold ${participant.speaking ? "bg-emerald-600" : "bg-slate-700"}`}>{participant.username[0].toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{participant.username} {isSelf && <span className="text-xs text-slate-500">(sen)</span>}</div>
          <div className="flex gap-1.5 text-xs">
            {participant.muted ? <span className="text-red-400">🔇 muted</span> : <span className="text-emerald-400">🎙️ live</span>}
            {participant.cameraOn && <span>📷</span>}
            {participant.screenSharing && <span>🖥️ sharing</span>}
          </div>
        </div>
      </div>
      {participant.speaking && <div className="absolute bottom-0 left-0 h-1 w-full bg-emerald-500 animate-pulse" />}
    </div>
  );
}

function VideoGrid() {
  const voice = useVoiceStore();
  const localVideo = voice.participants.find((p)=>p.id==="self" && p.cameraOn);
  const remoteVideo = voice.participants.filter((p)=>p.cameraOn && p.id!=="self");
  if (!localVideo && remoteVideo.length===0) return null;
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-semibold text-slate-400">Video</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {[localVideo, ...remoteVideo].filter(Boolean).map((p)=>(
          <div key={p!.id} className="aspect-video overflow-hidden rounded-xl bg-slate-800">
            <VideoTile stream={p!.stream} muted={p!.id==="self"} label={p!.username} />
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoTile({ stream, muted, label }: { stream?: MediaStream; muted?: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      void ref.current.play().catch(()=>{});
    }
  }, [stream]);
  if (!stream) return <div className="grid h-full place-items-center text-slate-500">Kamera kapalı</div>;
  return (
    <>
      <video ref={ref} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
      <div className="bg-slate-900 px-2 py-1 text-xs text-slate-300">{label}</div>
    </>
  );
}
import { useVoiceStore } from "../../stores/voice-store";
