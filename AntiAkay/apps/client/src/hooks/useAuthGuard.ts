import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth-store";

export function useAuthGuard(requireAuth = true): boolean {
  const { user, initialized, loading } = useAuthStore();
  const nav = useNavigate();
  useEffect(() => {
    if (!initialized || loading) return;
    if (requireAuth && !user) nav("/login", { replace: true });
    if (!requireAuth && user) nav("/app", { replace: true });
  }, [user, initialized, loading, requireAuth, nav]);
  return !!user;
}
