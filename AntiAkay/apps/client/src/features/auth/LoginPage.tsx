import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../../stores/auth-store";
import { Button, Input, Card } from "../../components/ui/button";

export function LoginPage() {
  const { signIn, error } = useAuthStore();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!email.includes("@")) return setLocalError("Geçerli bir e-posta girin.");
    if (password.length < 6) return setLocalError("Şifre en az 6 karakter olmalı.");
    setLoading(true);
    try {
      await signIn(email, password);
      nav("/app", { replace: true });
    } catch (err) {
      setLocalError((err as Error).message ?? "Giriş başarısız.");
    } finally { setLoading(false); }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4 py-12">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-600 text-xl font-black text-white">O</div>
          <h1 className="mt-4 text-2xl font-bold text-white">Tekrar hoş geldin!</h1>
          <p className="mt-1 text-sm text-slate-400">Orbit hesabına giriş yap.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">E-posta</label>
            <Input id="email" type="email" autoComplete="email" placeholder="ada@orbit.app" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-slate-400">Şifre</label>
              <Link to="/reset-password" className="text-xs text-indigo-400 hover:underline">Şifreni mi unuttun?</Link>
            </div>
            <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          </div>
          {(localError || error) && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">{localError ?? error}</div>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Giriş yapılıyor..." : "Giriş yap"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Hesabın yok mu? <Link to="/register" className="font-medium text-indigo-400 hover:underline">Kayıt ol</Link>
        </p>
        <p className="mt-4 text-center text-xs text-slate-600">Supabase Auth ile korunur · service_role asla cliente sızmaz</p>
      </Card>
    </div>
  );
}
