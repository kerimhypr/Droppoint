import { useEffect, useState } from "react";
import { useFriendStore } from "../../stores/friend-store";
import { Button, Input, Card } from "../../components/ui/button";

export function FriendsPage() {
  const { friends, incoming, outgoing, fetchAll, sendRequest, accept, reject, remove } = useFriendStore();
  const [tab, setTab] = useState<"online"|"all"|"pending"|"add">("online");
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState<string|null>(null);

  useEffect(()=>{ void fetchAll(); },[fetchAll]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!username.trim()) return;
    try {
      await sendRequest(username.trim());
      setMsg("İstek gönderildi.");
      setUsername("");
    } catch (err) { setMsg((err as Error).message); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-2 border-b border-slate-800 px-4">
        <span className="font-semibold">Arkadaşlar</span>
        <div className="mx-4 h-6 w-px bg-slate-700" />
        <div className="flex gap-1">
          {(["online","all","pending","add"] as const).map((t)=>(
            <button key={t} onClick={()=>setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm capitalize ${tab===t ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/60 hover:text-white"}`}>
              {t==="online" ? "Çevrimiçi" : t==="all" ? "Tümü" : t==="pending" ? `Bekleyen ${incoming.length ? `(${incoming.length})` : ""}` : "Arkadaş Ekle"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab==="add" ? (
          <Card className="max-w-lg p-6">
            <h2 className="font-semibold">Arkadaş ekle</h2>
            <p className="mt-1 text-sm text-slate-400">Kullanıcı adıyla istek gönderebilirsin.</p>
            <form onSubmit={onAdd} className="mt-4 flex gap-2">
              <Input placeholder="Kullanıcı adı" value={username} onChange={(e)=>setUsername(e.target.value)} className="flex-1" />
              <Button type="submit">İstek gönder</Button>
            </form>
            {msg && <p className="mt-3 text-sm text-slate-300">{msg}</p>}
            {outgoing.length>0 && (
              <div className="mt-6">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Giden istekler</h3>
                <div className="mt-2 space-y-2">
                  {outgoing.map((r)=> <div key={r.id} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">{r.to.username}</div>)}
                </div>
              </div>
            )}
          </Card>
        ) : tab==="pending" ? (
          <div className="max-w-2xl space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Gelen istekler — {incoming.length}</h3>
            {incoming.length===0 ? <p className="text-sm text-slate-500">Bekleyen istek yok.</p> : incoming.map((r)=>(
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
                <div className="flex items-center gap-3"><div className="grid h-8 w-8 place-items-center rounded-full bg-slate-700">{r.from.username[0].toUpperCase()}</div><span className="font-medium">{r.from.username}</span></div>
                <div className="flex gap-2"><Button size="sm" onClick={()=>void accept(r.id)}>Kabul et</Button><Button size="sm" variant="secondary" onClick={()=>void reject(r.id)}>Reddet</Button></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {(tab==="online" ? friends.filter((f)=>f.status==="online"||f.status==="idle") : friends).map((f)=>(
              <div key={f.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 hover:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <span className="relative grid h-10 w-10 place-items-center rounded-full bg-slate-700 font-semibold">{f.username[0].toUpperCase()}
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-slate-900 ${f.status==="online" ? "bg-emerald-500" : f.status==="idle" ? "bg-amber-400" : "bg-slate-600"}`} />
                  </span>
                  <div>
                    <div className="font-medium">{f.displayName}</div>
                    <div className="text-xs text-slate-500">@{f.username}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost">Mesaj</Button>
                  <Button size="sm" variant="secondary" onClick={()=>void remove(f.id)}>Kaldır</Button>
                </div>
              </div>
            ))}
            {friends.length===0 && <p className="py-8 text-center text-sm text-slate-500">Henüz arkadaşın yok.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
