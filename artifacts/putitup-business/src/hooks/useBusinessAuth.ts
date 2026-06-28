import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { API_BASE } from "@/lib/api";

export interface BusinessClient {
  id: number;
  email: string;
  name: string;
  company: string;
  plan: string;
  tokenBalance: number;
  totalAdsWatched: number;
}

function readSessionBase(): { id: number; email: string; name: string; company: string } | null {
  const id = localStorage.getItem("pb_client_id");
  const email = localStorage.getItem("pb_client_email");
  const name = localStorage.getItem("pb_client_name");
  const company = localStorage.getItem("pb_client_company");
  if (id && email) return { id: parseInt(id, 10), email, name: name ?? email, company: company ?? "" };
  return null;
}

export function useBusinessAuth() {
  const [client, setClient] = useState<BusinessClient | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const base = readSessionBase();
    if (!base) { setClient(null); setLoading(false); return; }

    const token = localStorage.getItem("pb_session_token") ?? "";
    if (!token) {
      const plan = localStorage.getItem("pb_client_plan") ?? "free";
      setClient({ ...base, plan, tokenBalance: 0, totalAdsWatched: 0 });
      setLoading(false);
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${API_BASE}/api/auth/client/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        const { client: c } = await res.json() as { client: Record<string, unknown> };
        const plan = (c.plan as string | undefined) ?? localStorage.getItem("pb_client_plan") ?? "free";
        localStorage.setItem("pb_client_plan", plan);
        setClient({
          id: base.id,
          email: base.email,
          name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || base.name,
          company: (c.company as string) ?? base.company,
          plan,
          tokenBalance: (c.tokenBalance as number) ?? 0,
          totalAdsWatched: (c.totalAdsWatched as number) ?? 0,
        });
      } else if (res.status === 401) {
        // Token scaduto — disconnetti
        ["pb_client_id","pb_client_email","pb_client_name","pb_client_company",
         "pb_session_token","pb_client_plan","pb_is_admin"].forEach(k => localStorage.removeItem(k));
        setClient(null);
      } else {
        // Fallback localStorage
        const plan = localStorage.getItem("pb_client_plan") ?? "free";
        setClient({ ...base, plan, tokenBalance: 0, totalAdsWatched: 0 });
      }
    } catch {
      // Rete non disponibile — usa dati locali
      const plan = localStorage.getItem("pb_client_plan") ?? "free";
      setClient({ ...base, plan, tokenBalance: 0, totalAdsWatched: 0 });
    }

    setLoading(false);
  }, []);

  useEffect(() => { loadSession(); }, [loadSession]);

  useEffect(() => {
    // Re-validate the session on cross-tab/login changes WITHOUT flipping to a
    // global loading state. Setting loading(true) here briefly cleared `client`,
    // which made the route guards bounce between /login and /dashboard in an
    // endless reload loop right after entering the email code.
    const sync = () => { loadSession(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [loadSession]);

  const logout = useCallback(() => {
    const token = localStorage.getItem("pb_session_token") ?? "";
    if (token) {
      fetch(`${API_BASE}/api/auth/client/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    ["pb_client_id","pb_client_email","pb_client_name","pb_client_company",
     "pb_session_token","pb_client_plan","pb_is_admin"].forEach(k => localStorage.removeItem(k));
    setClient(null);
    window.dispatchEvent(new Event("storage"));
  }, []);

  return { client, loading, logout, refresh: loadSession };
}

export function useRequireBusinessAuth() {
  const { client, loading } = useBusinessAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!loading && !client) navigate("/login");
  }, [client, loading]);
  return client;
}
