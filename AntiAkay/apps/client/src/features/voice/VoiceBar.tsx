import { useVoiceStore } from "../../stores/voice-store";
import { useChannelStore } from "../../stores/channel-store";

export function VoiceBar() {
  const voice = useVoiceStore();
  const channels = useChannelStore((s)=>s.channels);
  if (!voice.channelId) return (
    <div className="px-3 py-2 text-xs text-slate-500">Bir ses kanalına katıl.</div>
  );
  const ch = channels.find((c)=>c.id===voice.channelId);
  return (
    <div className="bg-slate-950 p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <span className={`h-2 w-2 rounded-full ${voice.state==="connected" ? "bg-emerald-400" : voice.state==="connecting" ? "bg-amber-400 animate-pulse" : "bg-slate-600"}`} />
            {voice.state==="connected" ? "Ses bağlı" : voice.state==="connecting" ? "Bağlanıyor..." : voice.state==="reconnecting" ? "Yeniden bağlanıyor" : voice.state==="failed" ? "Bağlantı hatası" : voice.state}
          </div>
          <div className="text-sm font-medium">◉ {ch?.name ?? voice.channelId.slice(0,8)}</div>
        </div>
        <button onClick={()=>voice.leave()} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500" aria-label="Leave voice">Ayrıl</button>
      </div>

      {voice.error && <div className="mt-2 rounded bg-red-500/10 px-2 py-1.5 text-xs text-red-300">{voice.error}</div>}

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <ControlButton active={!voice.muted} onClick={()=>voice.toggleMute()} label={voice.muted ? "Unmute" : "Mute"} icon={voice.muted ? "🔇" : "🎙️"} />
        <ControlButton active={!voice.deafened} onClick={()=>voice.toggleDeafen()} label={voice.deafened ? "Undeafen" : "Deafen"} icon={voice.deafened ? "🔈" : "🎧"} />
        <ControlButton active={voice.cameraOn} onClick={()=>void voice.toggleCamera()} label={voice.cameraOn ? "Cam Off" : "Cam On"} icon="📷" />
        <ControlButton active={voice.screenSharing} onClick={()=>void voice.toggleScreenShare()} label={voice.screenSharing ? "Stop" : "Share"} icon="🖥️" />
      </div>
    </div>
  );
}

function ControlButton({ active, onClick, label, icon }: { active: boolean; onClick: ()=>void; label: string; icon: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-medium ${active ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-slate-800/50 text-slate-400 hover:bg-slate-800"}`}>
      <span className="text-base">{icon}</span> {label}
    </button>
  );
}
