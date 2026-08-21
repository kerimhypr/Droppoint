import { useState } from "react";
import { useChannelStore, type Channel } from "../../stores/channel-store";
import { useVoiceStore } from "../../stores/voice-store";

export function ChannelSidebar({ guild, channels, onCloseMobile }: { guild: { id: string; name: string } | null; channels: Channel[]; onCloseMobile: ()=>void }) {
  const { activeChannelId, setActiveChannel, createChannel } = useChannelStore();
  const voice = useVoiceStore();
  const [showNew, setShowNew] = useState<null|"text"|"voice">(null);
  const [name, setName] = useState("");

  const textChannels = channels.filter((c)=>c.kind==="text");
  const voiceChannels = channels.filter((c)=>c.kind==="voice");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!guild || !showNew || !name.trim()) return;
    const clean = name.trim().toLowerCase().replace(/\s+/g,"-");
    await createChannel(guild.id, clean, showNew);
    setName("");
    setShowNew(null);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center justify-between border-b border-slate-800 px-4">
        <span className="truncate text-sm font-bold">{guild?.name ?? "Sunucu seç"}</span>
        <button onClick={onCloseMobile} className="rounded p-1 text-slate-400 hover:bg-slate-800 md:hidden" aria-label="Close">✕</button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-2">
        <section>
          <div className="flex items-center justify-between px-2 py-1">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Metin kanalları</h3>
            <button onClick={()=>setShowNew("text")} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Create text channel">+</button>
          </div>
          <div className="space-y-0.5">
            {textChannels.map((ch)=>(
              <button
                key={ch.id}
                onClick={()=>setActiveChannel(ch.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${activeChannelId===ch.id ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"}`}
              >
                <span className="text-slate-500">#</span> <span className="truncate">{ch.name}</span>
              </button>
            ))}
            {textChannels.length===0 && <p className="px-2 py-2 text-xs text-slate-500">Kanal yok.</p>}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between px-2 py-1">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Ses kanalları</h3>
            <button onClick={()=>setShowNew("voice")} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Create voice channel">+</button>
          </div>
          <div className="space-y-0.5">
            {voiceChannels.map((ch)=> {
              const isActive = voice.channelId===ch.id;
              const isConnected = isActive && voice.state==="connected";
              return (
                <button
                  key={ch.id}
                  onClick={()=> {
                    if (voice.channelId===ch.id) return;
                    void voice.join(ch.id).catch(()=>{});
                    setActiveChannel(ch.id);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${activeChannelId===ch.id ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"} ${isActive ? "ring-1 ring-emerald-500/30" : ""}`}
                >
                  <span className={isConnected ? "text-emerald-400" : "text-slate-500"}>◉</span>
                  <span className="truncate">{ch.name}</span>
                  {isActive && <span className={`ml-auto h-2 w-2 rounded-full ${isConnected ? "bg-emerald-400" : voice.state==="connecting" ? "bg-amber-400 animate-pulse" : "bg-slate-600"}`} />}
                </button>
              );
            })}
            {/* Inline voice participants under active voice channel */}
            {voice.channelId && voice.participants.length>0 && (
              <div className="ml-6 mt-1 space-y-1 border-l border-slate-800 pl-3">
                {voice.participants.map((p)=>(
                  <div key={p.id} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className={`h-6 w-6 grid place-items-center rounded-full text-[11px] font-bold ${p.speaking ? "ring-2 ring-emerald-400 bg-slate-700" : "bg-slate-800"}`}>{p.username[0]}</span>
                    <span className="truncate">{p.username}</span>
                    {p.muted && <span title="Muted">🔇</span>}
                    {p.cameraOn && <span title="Camera">📷</span>}
                    {p.screenSharing && <span title="Screen">🖥️</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {showNew && (
        <form onSubmit={onCreate} className="border-t border-slate-800 p-3">
          <label className="block text-xs font-semibold text-slate-400">Yeni {showNew==="text" ? "metin" : "ses"} kanalı</label>
          <div className="mt-1 flex gap-2">
            <input value={name} onChange={(e)=>setName(e.target.value)} placeholder={showNew==="text" ? "genel" : "Genel"} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-indigo-500" autoFocus />
            <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">Ekle</button>
            <button type="button" onClick={()=>setShowNew(null)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300">İptal</button>
          </div>
        </form>
      )}
    </div>
  );
}
