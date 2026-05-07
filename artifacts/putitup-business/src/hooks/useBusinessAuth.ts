import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";

export interface BusinessClient {
  id: number;
  email: string;
  name: string;
  company: string;
  tokenBalance?: number;
  totalAdsWatched?: number;
}

function readSession(): BusinessClient | null {
  const id = localStorage.getItem("pb_client_id");
  const email = localStorage.getItem("pb_client_email");
  const name = localStorage.getItem("pb_client_name");
  const company = localStorage.getItem("pb_client_company");
  if (id && email) return { id: parseInt(id, 10), email, name: name ?? email, company: company ?? "" };
  return null;
}

export function useBusinessAuth() {
  const [client, setClient] = useState<BusinessClient | null>(readSession);

  useEffect(() => {
    const sync = () => setClient(readSession());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("pb_client_id");
    localStorage.removeItem("pb_client_email");
    localStorage.removeItem("pb_client_name");
    localStorage.removeItem("pb_client_company");
    setClient(null);
    window.dispatchEvent(new Event("storage"));
  }, []);

  return { client, logout };
}

export function useRequireBusinessAuth() {
  const { client } = useBusinessAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!client) navigate("/login");
  }, [client]);
  return client;
}
