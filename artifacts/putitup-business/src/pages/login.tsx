import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Zap, Eye, EyeOff, Mail, RotateCcw, ShieldCheck } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useBusinessAuth } from "@/hooks/useBusinessAuth";

type Mode = "password" | "code";

export default function Login() {
  const [, navigate] = useLocation();
  const { client, loading } = useBusinessAuth();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Email-code (OTP) login state
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Already logged in → go to dashboard
  useEffect(() => {
    if (!loading && client) navigate("/dashboard");
  }, [client, loading, navigate]);

  const persistSession = (data: any) => {
    localStorage.setItem("pb_session_token", data.token);
    localStorage.setItem("pb_client_id", String(data.client.id));
    localStorage.setItem("pb_client_email", data.client.email);
    localStorage.setItem(
      "pb_client_name",
      `${data.client.firstName ?? ""} ${data.client.lastName ?? ""}`.trim()
    );
    localStorage.setItem("pb_client_company", data.client.company ?? "");
    localStorage.setItem("pb_client_plan", data.client.plan ?? "free");
    localStorage.removeItem("pb_is_admin");
    window.dispatchEvent(new Event("storage"));
    navigate("/dashboard");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Account without a password → offer the email-code login flow.
        if (data.code === "no_password") {
          setMode("code");
          setError(null);
          setInfo("Questo account non ha una password. Ti inviamo un codice via email per accedere.");
        } else {
          setError(data.error ?? "Credenziali non valide");
        }
        return;
      }
      if (!data.token || !data.client) {
        setError("Risposta del server non valida — riprova");
        return;
      }
      persistSession(data);
    } catch {
      setError("Errore di connessione — riprova");
    } finally {
      setSubmitting(false);
    }
  };

  const startCooldown = () => {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((v) => {
        if (v <= 1) { clearInterval(interval); return 0; }
        return v - 1;
      });
    }, 1000);
  };

  const handleSendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) { setError("Inserisci la tua email"); return; }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Errore invio codice"); return; }
      setCodeSent(true);
      setInfo(`Codice inviato a ${email.trim().toLowerCase()}`);
      startCooldown();
      if (data.devCode && String(data.devCode).length === 6) {
        const digits = String(data.devCode).split("");
        setCode(digits);
        setTimeout(() => handleVerifyCode(String(data.devCode)), 300);
      } else {
        setTimeout(() => codeRefs.current[0]?.focus(), 100);
      }
    } catch {
      setError("Errore di connessione — riprova");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCodeInput = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    if (digit && index < 5) codeRefs.current[index + 1]?.focus();
    if (next.every((d) => d !== "")) handleVerifyCode(next.join(""));
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) codeRefs.current[index - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      handleVerifyCode(pasted);
    }
  };

  const handleVerifyCode = async (codeStr?: string) => {
    const fullCode = codeStr ?? code.join("");
    if (fullCode.length !== 6) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: fullCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Codice non valido");
        setCode(["", "", "", "", "", ""]);
        setTimeout(() => codeRefs.current[0]?.focus(), 50);
        return;
      }
      // Existing client → verify returns a session token + client. New accounts
      // can't log in via this page, so guide them to registration.
      if (!data.token || !data.client) {
        setError("Nessun account trovato per questa email. Registrati prima di accedere.");
        return;
      }
      persistSession(data);
    } catch {
      setError("Errore di connessione — riprova");
    } finally {
      setSubmitting(false);
    }
  };

  const switchToCode = () => {
    setMode("code");
    setError(null);
    setInfo(null);
    setCodeSent(false);
    setCode(["", "", "", "", "", ""]);
  };

  const switchToPassword = () => {
    setMode("password");
    setError(null);
    setInfo(null);
    setCodeSent(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Zap className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold tracking-tight">
          PUTITUP<span className="text-primary"> Business</span>
        </span>
      </Link>

      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="pb-4 text-center">
          <h1 className="text-2xl font-bold">Accedi</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "password"
              ? "Inserisci email e password per accedere al tuo account"
              : "Ti inviamo un codice via email per accedere"}
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {info && !error && (
            <Alert className="mb-4">
              <AlertDescription>{info}</AlertDescription>
            </Alert>
          )}

          {mode === "password" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@azienda.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPw ? "Nascondi password" : "Mostra password"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Accesso in corso…" : "Accedi"}
              </Button>

              <button
                type="button"
                onClick={switchToCode}
                className="flex w-full items-center justify-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Mail className="h-3.5 w-3.5" /> Accedi con codice email
              </button>
            </form>
          )}

          {mode === "code" && !codeSent && (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email-code">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email-code"
                    type="email"
                    placeholder="tu@azienda.com"
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    autoFocus
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !email.trim()}>
                {submitting ? "Invio codice…" : "Inviami il codice"}
              </Button>
              <button
                type="button"
                onClick={switchToPassword}
                className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Accedi con password
              </button>
            </form>
          )}

          {mode === "code" && codeSent && (
            <div className="space-y-6">
              <div>
                <Label className="mb-3 block text-center text-sm">Inserisci il codice a 6 cifre</Label>
                <div className="flex justify-center gap-2" onPaste={handlePaste}>
                  {code.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { codeRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeInput(i, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(i, e)}
                      className={`h-14 w-12 rounded-lg border text-center text-2xl font-bold tracking-widest transition-colors focus:outline-none focus:ring-2 focus:ring-primary
                        ${digit ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30 text-foreground"}
                        ${submitting ? "opacity-50 pointer-events-none" : ""}`}
                    />
                  ))}
                </div>
              </div>
              <Button
                className="w-full"
                disabled={submitting || code.join("").length !== 6}
                onClick={() => handleVerifyCode()}
              >
                {submitting ? "Verifica in corso…" : "Verifica e accedi →"}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => { setCodeSent(false); setCode(["", "", "", "", "", ""]); setError(null); }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Cambia email
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-1.5 ${resendCooldown > 0 ? "text-muted-foreground cursor-not-allowed" : "text-primary hover:text-primary/80"}`}
                  disabled={resendCooldown > 0 || submitting}
                  onClick={() => { setCode(["", "", "", "", "", ""]); setError(null); handleSendCode(); }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {resendCooldown > 0 ? `Reinvia (${resendCooldown}s)` : "Reinvia codice"}
                </button>
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Non hai un account?{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              Registrati
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
