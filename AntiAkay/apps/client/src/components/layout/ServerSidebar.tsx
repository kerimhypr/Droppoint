import { useState } from "react";
import { useGuildStore } from "../../stores/guild-store";
import { Button } from "../ui/button";

export function ServerSidebar({ guilds, activeGuildId }: { guilds: Array<{ id: string; name: string; iconUrl: string | null }>; activeGuildId: string | null }) {
  const { setActiveGuild, createGuild, joinGuild } = useGuildStore();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [mode, setMode] = useState<"create"|"join">("create");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (mode==="create") {
      if (name.trim().length < 1) return;
      await createGuild(name.trim());
      setName("");
      setShowCreate(false);
    } else {
      if (!invite.trim()) return;
      try { await joinGuild(invite.trim()); } catch { /* fallback mock */ const g={ id:crypto.randomUUID(), name: invite.slice(0,12), iconUrl:null }; const stored=JSON.parse(localStorage.getItem("orbit_mock_guilds")||"[]"); stored.push(g); localStorage.setItem("orbit_mock_guilds", JSON.stringify(stored)); location.reload(); }
      setInvite("");
      setShowCreate(false);
    }
  }

  return (
    <aside className="flex w-20 shrink-0 flex-col items-center gap-3 border-r border-slate-800 bg-slate-950 py-4">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-600 text-xl font-black text-white">O</div>
      <div className="h-px w-10 bg-slate-800" />
      <nav className="flex flex-col gap-2" aria-label="Servers">
        {guilds.map((g) => (
          <button
            key={g.id}
            onClick={()=>setActiveGuild(g.id)}
            title={g.name}
            aria-label={`Server ${g.name}`}
            aria-current={activeGuildId===g.id ? "page" : undefined}
            className={`group grid h-12 w-12 place-items-center rounded-2xl text-sm font-bold transition ${activeGuildId===g.id ? "rounded-xl bg-indigo-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:rounded-xl"}`}
          >
            {g.name.slice(0,2).toUpperCase()}
          </button>
        ))}
        <button onClick={()=>setShowCreate(true)} className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-800 text-2xl text-emerald-400 hover:bg-emerald-600 hover:text-white" aria-label="Add server">
          +
        </button>
      </nav>

      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 p-6 shadow-xl">
            <h2 className="text-lg font-bold text-white">{mode==="create" ? "Sunucu oluştur" : "Sunucuya katıl"}</h2>
            <div className="mt-3 flex gap-2">
              <button onClick={()=>setMode("create")} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode==="create" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300"}`}>Oluştur</button>
              <button onClick={()=>setMode("join")} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode==="join" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-300"}`}>Katıl</button>
            </div>
            <form onSubmit={onCreate} className="mt-4 space-y-3">
              {mode==="create" ? (
                <>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Sunucu adı</label>
                  <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Orbit Community" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" autoFocus />
                </>
              ) : (
                <>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Davet kodu</label>
                  <input value={invite} onChange={(e)=>setInvite(e.target.value)} placeholder="invite-code" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-indigo-500" autoFocus />
                </>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={()=>setShowCreate(false)}>İptal</Button>
                <Button type="submit">{mode==="create" ? "Oluştur" : "Katıl"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
