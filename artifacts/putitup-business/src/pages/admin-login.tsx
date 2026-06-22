import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, ShieldAlert, Zap } from "lucide-react";
import { API_BASE } from "@/lib/api";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Credenziali non valide");
        return;
      }
      localStorage.setItem("pb_admin_token", data.token);
      localStorage.setItem("pb_client_id", "0");
      localStorage.setItem("pb_client_email", "admin@putitupbusiness.it");
      localStorage.setItem("pb_client_name", "Admin");
      localStorage.setItem("pb_client_company", "PUTITUP");
      localStorage.setItem("pb_is_admin", "true");
      window.dispatchEvent(new Event("storage"));
      navigate("/dashboard");
    } catch {
      setError("Errore di connessione");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold tracking-tight">
          PUTITUP<span className="text-primary"> Admin</span>
        </span>
      </div>

      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader className="pb-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-xl font-bold">Accesso Admin</h1>
          <p className="mt-1 text-xs text-muted-foreground">Area riservata · Solo uso interno</p>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs">Username</Label>
              <Input id="username" placeholder="admin" value={username}
                onChange={(e) => setUsername(e.target.value)} required autoFocus autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="password" type="password" placeholder="••••••••" className="pl-10"
                  value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
            </div>
            <Button type="submit" variant="destructive" className="w-full" disabled={loading || !username || !password}>
              {loading ? "Accesso…" : "Accedi come Admin"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
