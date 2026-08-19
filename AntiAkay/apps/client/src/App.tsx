import { useState } from "react";

const channels = ["genel", "duyurular", "proje-odası"];
const messages = [
  { author: "Ada", text: "Ses pipeline'ı hazır; tarayıcı WASM modülü yükleniyor.", time: "19:31" },
  { author: "Mert", text: "SFU signaling akışını test ortamında doğrulayalım.", time: "19:32" },
  { author: "Lina", text: "Yeni kanal izinlerini de gözden geçirdim.", time: "19:34" }
];

export function App() {
  const [activeChannel, setActiveChannel] = useState("genel");
  const [speaking, setSpeaking] = useState(true);
  return (
    <main className="flex h-screen overflow-hidden bg-slate-950">
      <aside className="flex w-20 flex-col items-center gap-4 border-r border-slate-800 bg-slate-900 py-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500 font-black">O</div>
        <div className="h-px w-10 bg-slate-700" />
        <button className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-800 text-xl hover:bg-indigo-500" aria-label="Add guild">+</button>
      </aside>

      <aside className="hidden w-64 border-r border-slate-800 bg-slate-900/80 md:block">
        <div className="border-b border-slate-800 px-5 py-4 font-semibold">Orbit Community</div>
        <div className="space-y-1 p-3">
          <p className="px-2 pb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Metin kanalları</p>
          {channels.map((channel) => (
            <button key={channel} onClick={() => setActiveChannel(channel)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${activeChannel === channel ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800"}`}>
              <span className="text-slate-500">#</span>{channel}
            </button>
          ))}
          <p className="px-2 pb-2 pt-6 text-xs font-bold uppercase tracking-widest text-slate-500">Ses kanalları</p>
          <div className="rounded-lg px-3 py-2 text-sm text-slate-400"><span className="mr-2 text-slate-500">◉</span>toplantı</div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
          <div><span className="mr-2 text-slate-500">#</span><span className="font-semibold">{activeChannel}</span></div>
          <div className="flex items-center gap-3 text-sm text-slate-400"><span className={`h-2 w-2 rounded-full ${speaking ? "bg-emerald-400" : "bg-slate-600"}`} />Gateway connected</div>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="mb-8"><h1 className="text-2xl font-bold">{activeChannel}</h1><p className="text-sm text-slate-500">Bu kanalın mesajları PostgreSQL cursor ile yüklenir.</p></div>
          {messages.map((message) => <article key={message.time} className="flex gap-3"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-700 font-semibold ${message.author === "Ada" && speaking ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950" : ""}`}>{message.author[0]}</div><div><div className="flex items-baseline gap-2"><span className="font-semibold">{message.author}</span><time className="text-xs text-slate-600">bugün {message.time}</time></div><p className="mt-1 text-slate-300">{message.text}</p></div></article>)}
        </div>
        <form className="m-4 flex rounded-xl border border-slate-700 bg-slate-900 px-4 py-3" onSubmit={(event) => event.preventDefault()}><input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-600" placeholder={`${activeChannel} kanalına mesaj gönder`} /><button className="ml-3 text-sm font-semibold text-indigo-400 hover:text-indigo-300">Gönder</button></form>
      </section>
    </main>
  );
}
