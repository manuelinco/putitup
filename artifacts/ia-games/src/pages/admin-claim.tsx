import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useAuth } from "@/contexts/auth";

export default function AdminClaim() {
  const [, navigate] = useLocation();
  const { refreshUser } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.username, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
      setSuccess(true);
      // Refresh user in memory so isAdmin=true is active immediately
      await refreshUser();
      setTimeout(() => navigate("/admin"), 1500);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm border-primary/40 bg-card">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-3">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-lg font-black">Admin Access</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Claim admin role for your account. Your Telegram username must match the configured admin username.
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {success ? (
            <div className="text-center py-6 space-y-2">
              <CheckCircle className="w-10 h-10 text-secondary mx-auto" />
              <p className="font-bold text-secondary">Admin access granted!</p>
              <p className="text-xs text-muted-foreground">Redirecting to admin panel…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                  Username
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  className="w-full p-3 rounded-lg bg-muted/40 border border-border/50 text-sm placeholder:text-muted-foreground"
                  placeholder="admin_username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    className="w-full p-3 pr-10 rounded-lg bg-muted/40 border border-border/50 text-sm placeholder:text-muted-foreground"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPw(!showPw)}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 border border-destructive/30 rounded-lg p-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {error}
                </div>
              )}
              <Button
                type="submit"
                className="w-full font-bold"
                disabled={loading || !form.username || !form.password}
              >
                {loading ? "Verifying…" : "Claim Admin Access"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
