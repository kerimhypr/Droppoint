import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../stores/auth-store";
import { Button, Input, Card } from "../../components/ui/button";

export function ResetPasswordPage() {
  const { resetPassword } = useAuthStore();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) return setError("Geçerli e-posta girin.");
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-bold text-white">Şifreyi sıfırla</h1>
        <p className="mt-1 text-sm text-slate-400">E-postana sıfırlama bağlantısı göndereceğiz.</p>
        {sent ? (
          <div className="mt-6 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            E-posta gönderildi. Gelen kutunu kontrol et.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Input placeholder="ada@orbit.app" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
            {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Gönderiliyor..." : "Bağlantı gönder"}</Button>
          </form>
        )}
        <Link to="/login" className="mt-6 block text-center text-sm text-indigo-400 hover:underline">Girişe dön</Link>
      </Card>
    </div>
  );
}
