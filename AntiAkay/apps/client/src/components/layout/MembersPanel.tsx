export function MembersPanel() {
  const groups = [
    { title: "Çevrimiçi — 2", members: [{ name:"Ada", status:"online", role:"Admin" }, { name:"Mert", status:"idle", role:"Member" }] },
    { title: "Çevrimdışı — 3", members: [{ name:"Lina", status:"offline", role:"Member" }, { name:"Zeynep", status:"offline", role:"Member" }, { name:"Kerim", status:"offline", role:"Member" }] },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="h-12 border-b border-slate-800 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500">Üyeler</div>
      <div className="flex-1 space-y-6 overflow-y-auto p-3">
        {groups.map((g)=>(
          <section key={g.title}>
            <h3 className="px-2 text-xs font-semibold text-slate-500">{g.title}</h3>
            <div className="mt-2 space-y-1">
              {g.members.map((m)=>(
                <div key={m.name} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-800/50">
                  <span className="relative grid h-8 w-8 place-items-center rounded-full bg-slate-700 text-sm font-semibold">{m.name[0]}
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${m.status==="online" ? "bg-emerald-500" : m.status==="idle" ? "bg-amber-400" : "bg-slate-600"}`} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.name}</div>
                    <div className="text-xs text-slate-500">{m.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
