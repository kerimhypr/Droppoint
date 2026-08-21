import { useState } from "react";
import { useAuthStore } from "../../stores/auth-store";
import { Button, Input, Card } from "../../components/ui/button";

export function SettingsPage() {
  const { user, signOut } = useAuthStore();
  const [tab, setTab] = useState<"account"|"profile"|"appearance">("account");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [status, setStatus] = useState("Çevrimiçi");

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 border-r border-slate-800 bg-slate-900/40 p-4 md:block">
        <h2 className="px-2 text-xs font-bold uppercase tracking-widest text-slate-500">Kullanıcı ayarları</h2>
        <nav className="mt-3 space-y-1">
          {[
            ["account","Hesabım"],
            ["profile","Profiller"],
            ["appearance","Görünüm"],
          ].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id as never)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${tab===id ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/60"}`}>{label}</button>
          ))}
        </nav>
        <Button variant="danger" size="sm" className="mt-6 w-full" onClick={()=>void signOut()}>Çıkış yap</Button>
      </aside>
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        {tab==="account" && (
          <div className="mx-auto max-w-2xl space-y-6">
            <h1 className="text-xl font-bold">Hesabım</h1>
            <Card className="p-6">
              <div className="flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-indigo-600 text-2xl font-bold">{(user?.displayName ?? user?.username ?? "U")[0].toUpperCase()}</div>
                <div>
                  <div className="font-semibold">{user?.displayName ?? user?.username}</div>
                  <div className="text-sm text-slate-400">{user?.email}</div>
                  <div className="mt-1 text-xs text-slate-500">ID: {user?.id.slice(0,8)}</div>
                </div>
                <Button variant="secondary" size="sm" className="ml-auto">Avatar değiştir</Button>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div><label className="mb-1 block text-xs font-semibold uppercase text-slate-400">Kullanıcı adı</label><Input value={user?.username ?? ""} readOnly /></div>
                <div><label className="mb-1 block text-xs font-semibold uppercase text-slate-400">E-posta</label><Input value={user?.email ?? ""} readOnly /></div>
              </div>
            </Card>
            <Card className="p-6">
              <h3 className="font-semibold">Şifre ve güvenlik</h3>
              <p className="mt-1 text-sm text-slate-400">Şifreni değiştirmek için e-posta ile sıfırlama bağlantısı gönder.</p>
              <Button variant="secondary" size="sm" className="mt-3">Şifreyi değiştir</Button>
            </Card>
          </div>
        )}
        {tab==="profile" && (
          <div className="mx-auto max-w-2xl space-y-6">
            <h1 className="text-xl font-bold">Profil</h1>
            <Card className="p-6 space-y-4">
              <div><label className="mb-1 block text-xs font-semibold uppercase text-slate-400">Görünen ad</label><Input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} placeholder="Ada" /></div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">Durum</label>
                <select value={status} onChange={(e)=>setStatus(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm outline-none focus:border-indigo-500">
                  <option>Çevrimiçi</option><option>Boşta</option><option>Rahatsız etmeyin</option><option>Görünmez</option>
                </select>
              </div>
              <Button>Kaydet</Button>
            </Card>
          </div>
        )}
        {tab==="appearance" && (
          <div className="mx-auto max-w-2xl">
            <h1 className="text-xl font-bold">Görünüm</h1>
            <Card className="mt-4 p-6">
              <h3 className="font-semibold">Tema</h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border-2 border-indigo-500 bg-slate-950 p-4"><div className="font-medium">Koyu</div><p className="text-xs text-slate-400">Varsayılan Orbit teması</p></div>
                <div className="rounded-xl border border-slate-700 bg-white p-4 text-slate-900"><div className="font-medium">Açık</div><p className="text-xs text-slate-500">Yakında</p></div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
