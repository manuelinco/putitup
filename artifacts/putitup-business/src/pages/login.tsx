import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Zap, Shield, RotateCcw } from "lucide-react";
import { API_BASE } from "@/lib/api";

type Step = "email" | "code";

export default function Login() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

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
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Errore invio codice"); return; }
      if (data.isNewUser) { navigate(`/register?email=${encodeURIComponent(email.trim().toLowerCase())}`); return; }
      setStep("code");
      startCooldown();
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    } catch {
      setError("Errore di connessione — riprova");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeInput = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    if (digit && index < 5) codeRefs.current[index + 1]?.focus();
    if (next.every(d => d !== "")) handleVerify(next.join(""));
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      codeRefs.current[5]?.focus();
      handleVerify(pasted);
    }
  };

  const handleVerify = async (codeStr?: string) => {
    const fullCode = codeStr ?? code.join("");
    if (fullCode.length !== 6) return;
    setError(null);
    setLoading(true);
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
      localStorage.setItem("pb_session_token", data.token);
      localStorage.setItem("pb_client_id", String(data.client.id));
      localStorage.setItem("pb_client_email", data.client.email);
      localStorage.setItem("pb_client_name", `${data.client.firstName} ${data.client.lastName}`);
      localStorage.setItem("pb_client_company", data.client.company ?? "");
      window.dispatchEvent(new Event("storage"));
      navigate("/dashboard");
    } catch {
      setError("Errore di connessione — riprova");
    } finally {
      setLoading(false);
    }
  };

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
          {step === "email" ? (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">Accedi a PUTITUP</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Inserisci la tua email — ti inviamo un codice di accesso istantaneo
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">Codice di verifica</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Abbiamo inviato un codice a <strong className="text-foreground">{email}</strong>
              </p>
            </>
          )}
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email aziendale</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@azienda.com"
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading || !email}>
                {loading ? "Invio codice…" : "Invia codice →"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                🔒 Nessuna password — accesso sicuro via email
              </p>
            </form>
          ) : (
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
                        ${loading ? "opacity-50 pointer-events-none" : ""}`}
                    />
                  ))}
                </div>
              </div>

              <Button
                className="w-full"
                disabled={loading || code.join("").length !== 6}
                onClick={() => handleVerify()}
              >
                {loading ? "Verifica…" : "Verifica codice →"}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                  onClick={() => { setStep("email"); setCode(["","","","","",""]); setError(null); }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Cambia email
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-1.5 transition-colors ${resendCooldown > 0 ? "text-muted-foreground cursor-not-allowed" : "text-primary hover:text-primary/80"}`}
                  disabled={resendCooldown > 0 || loading}
                  onClick={() => { setCode(["","","","","",""]); setError(null); handleSendCode(); }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {resendCooldown > 0 ? `Reinvia (${resendCooldown}s)` : "Reinvia codice"}
                </button>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                ⏱ Il codice scade in 10 minuti · 🔒 Codice usa-e-getta
              </p>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Non hai un account?{" "}
            <Link href="/register" className="text-primary hover:underline font-medium">
              Registrati
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
