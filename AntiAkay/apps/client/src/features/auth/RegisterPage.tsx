import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/auth-store";
import { Button, Input, Card } from "../../components/ui/button";

export function RegisterPage() {
  const { signUp } = useAuthStore();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(username)) return "Kullanıcı adı 2-32 karakter, harf/rakam/_ içermeli.";
    if (!email.includes("@")) return "Geçerli e-posta girin.";
    if (password.length < 8) return "Şifre en az 8 karakter.";
    if (password !== confirm) return "Şifreler eşleşmiyor.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) return setError(v);
    setError(null);
    setLoading(true);
    try {
      await signUp(email, password, username);
      nav("/login", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4 py-12">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-white">Hesap oluştur</h1>
        <p className="mt-1 text-sm text-slate-400">Orbit’e katıl, sunucular kur.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">E-posta</label>
            <Input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="ada@orbit.app" type="email" required />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Kullanıcı adı</label>
            <Input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="ada" required />
            <p className="mt-1 text-xs text-slate-500">Benzersiz, 2-32 karakter.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Şifre</label>
            <Input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Şifre (tekrar)</label>
            <Input type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">{error}</div>}
          <Button type="submit" disabled={loading} className="w-full">{loading ? "Oluşturuluyor..." : "Kayıt ol"}</Button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Zaten hesabın var mı? <Link to="/login" className="text-indigo-400 hover:underline">Giriş yap</Link>
        </p>
      </Card>
    </div>
  );
}
