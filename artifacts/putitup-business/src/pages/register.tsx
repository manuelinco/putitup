import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, CheckCircle2, Mail, User, Zap, Shield, RotateCcw } from "lucide-react";
import { API_BASE } from "@/lib/api";

const plans = [
  { id: "free", label: "Free", price: "€0/mo", description: "5 dataset base/mese — 5 ad per download", highlight: "Senza carta" },
  { id: "starter", label: "Starter", price: "€9.99/mo", description: "Dataset base illimitati, niente ads" },
  { id: "business", label: "Business", price: "€19.99/mo", description: "Dataset premium + richieste custom", popular: true },
  { id: "premium", label: "Premium", price: "Custom", description: "Enterprise: tutto illimitato + priorità" },
];

type Step = "email" | "code" | "profile";

export default function Register() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const prefillEmail = params.get("email") ?? "";

  const [step, setStep] = useState<Step>(prefillEmail ? "code" : "email");
  const [email, setEmail] = useState(prefillEmail);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("free");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(prefillEmail ? 60 : 0);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!prefillEmail || resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((v) => {
        if (v <= 1) { clearInterval(interval); return 0; }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [prefillEmail]);

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
      setStep("code");
      startCooldown();
      // Dev mode: auto-fill the code if returned by API
      if (data.devCode && data.devCode.length === 6) {
        const digits = data.devCode.split("");
        setCode(digits);
        setTimeout(() => handleVerifyCode(data.devCode), 300);
      } else {
        setTimeout(() => codeRefs.current[0]?.focus(), 100);
      }
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
    if (next.every(d => d !== "")) handleVerifyCode(next.join(""));
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
      if (!data.isNewUser) {
        localStorage.setItem("pb_session_token", data.token);
        localStorage.setItem("pb_client_id", String(data.client.id));
        localStorage.setItem("pb_client_email", data.client.email);
        localStorage.setItem("pb_client_name", `${data.client.firstName} ${data.client.lastName}`);
        localStorage.setItem("pb_client_company", data.client.company ?? "");
        window.dispatchEvent(new Event("storage"));
        navigate("/dashboard");
        return;
      }
      setStep("profile");
    } catch {
      setError("Errore di connessione — riprova");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/otp/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          company: company.trim() || null,
          plan: selectedPlan,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Errore registrazione"); return; }
      localStorage.setItem("pb_session_token", data.token);
      localStorage.setItem("pb_client_id", String(data.client.id));
      localStorage.setItem("pb_client_email", data.client.email);
      localStorage.setItem("pb_client_name", `${data.client.firstName} ${data.client.lastName}`);
      localStorage.setItem("pb_client_company", data.client.company ?? "");
      window.dispatchEvent(new Event("storage"));
      setSuccess(true);
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch {
      setError("Errore di connessione — riprova");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border bg-card text-center p-8">
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold">Account creato! 🎉</h2>
          <p className="mt-2 text-sm text-muted-foreground">Benvenuto su PUTITUP Business. Redirect in corso…</p>
        </Card>
      </div>
    );
  }

  const stepLabels = ["Email", "Verifica", "Profilo"];
  const stepIndex = step === "email" ? 0 : step === "code" ? 1 : 2;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-6 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold tracking-tight">
          PUTITUP<span className="text-primary"> Business</span>
        </span>
      </Link>

      {/* Stepper */}
      <div className="mb-6 flex items-center gap-2">
        {stepLabels.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors
              ${i < stepIndex ? "bg-primary text-white" : i === stepIndex ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
              {i < stepIndex ? "✓" : i + 1}
            </div>
            <span className={`text-xs font-medium ${i === stepIndex ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
            {i < 2 && <div className={`h-px w-8 ${i < stepIndex ? "bg-primary" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      <Card className="w-full max-w-lg border-border bg-card">
        <CardHeader className="pb-4 text-center">
          {step === "email" && (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">Crea il tuo account</h1>
              <p className="mt-1 text-sm text-muted-foreground">Accedi ai migliori dataset AI validati</p>
            </>
          )}
          {step === "code" && (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">Verifica email</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Codice inviato a <strong className="text-foreground">{email}</strong>
              </p>
            </>
          )}
          {step === "profile" && (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <User className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">Il tuo profilo</h1>
              <p className="mt-1 text-sm text-muted-foreground">Pochi dettagli e sei pronto</p>
            </>
          )}
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === "email" && (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email aziendale</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="tu@azienda.com" className="pl-10"
                    value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading || !email}>
                {loading ? "Invio codice…" : "Continua →"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                🔒 Nessuna password da ricordare — accesso via codice email
              </p>
            </form>
          )}

          {step === "code" && (
            <div className="space-y-6">
              <div>
                <Label className="mb-3 block text-center text-sm">Codice a 6 cifre</Label>
                <div className="flex justify-center gap-2" onPaste={handlePaste}>
                  {code.map((digit, i) => (
                    <input key={i} ref={(el) => { codeRefs.current[i] = el; }}
                      type="text" inputMode="numeric" maxLength={1} value={digit}
                      onChange={(e) => handleCodeInput(i, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(i, e)}
                      className={`h-14 w-12 rounded-lg border text-center text-2xl font-bold tracking-widest transition-colors focus:outline-none focus:ring-2 focus:ring-primary
                        ${digit ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30 text-foreground"}
                        ${loading ? "opacity-50 pointer-events-none" : ""}`}
                    />
                  ))}
                </div>
              </div>
              <Button className="w-full" disabled={loading || code.join("").length !== 6} onClick={() => handleVerifyCode()}>
                {loading ? "Verifica…" : "Verifica →"}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" className="text-muted-foreground hover:text-foreground flex items-center gap-1.5"
                  onClick={() => { setStep("email"); setCode(["","","","","",""]); setError(null); }}>
                  <RotateCcw className="h-3.5 w-3.5" /> Cambia email
                </button>
                <button type="button"
                  className={`flex items-center gap-1.5 ${resendCooldown > 0 ? "text-muted-foreground cursor-not-allowed" : "text-primary hover:text-primary/80"}`}
                  disabled={resendCooldown > 0 || loading}
                  onClick={() => { setCode(["","","","","",""]); setError(null); handleSendCode(); }}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  {resendCooldown > 0 ? `Reinvia (${resendCooldown}s)` : "Reinvia codice"}
                </button>
              </div>
              <p className="text-center text-xs text-muted-foreground">⏱ Valido 10 min · 🔒 Usa e getta</p>
            </div>
          )}

          {step === "profile" && (
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Plan selector */}
              <div className="mb-2">
                <p className="mb-2 text-sm font-medium">Scegli il piano</p>
                <div className="grid grid-cols-2 gap-2">
                  {plans.map((p) => (
                    <button key={p.id} type="button" onClick={() => setSelectedPlan(p.id)}
                      className={`relative rounded-lg border p-3 text-left transition-colors ${selectedPlan === p.id ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:border-primary/50"}`}>
                      {p.popular && <Badge className="absolute -top-2 right-1 text-[9px] px-1.5 py-0">Popolare</Badge>}
                      {(p as any).highlight && <Badge variant="secondary" className="absolute -top-2 left-1 text-[9px] px-1.5 py-0">{(p as any).highlight}</Badge>}
                      <p className="text-xs font-semibold">{p.label}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-primary">{p.price}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight">{p.description}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName" className="text-xs">Nome *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="firstName" placeholder="Mario" className="pl-10" value={firstName}
                      onChange={(e) => setFirstName(e.target.value)} required autoFocus />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName" className="text-xs">Cognome *</Label>
                  <Input id="lastName" placeholder="Rossi" value={lastName}
                    onChange={(e) => setLastName(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company" className="text-xs">Azienda (opzionale)</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="company" placeholder="Acme S.r.l." className="pl-10" value={company}
                    onChange={(e) => setCompany(e.target.value)} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading || !firstName || !lastName}>
                {loading ? "Creazione account…" : selectedPlan === "free" ? "Crea account gratuito →" : `Inizia piano ${plans.find(p => p.id === selectedPlan)?.label} →`}
              </Button>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Hai già un account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">Accedi</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
