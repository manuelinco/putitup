import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2, CheckCircle2, Mail, User, Zap, Shield, RotateCcw,
  Phone, MapPin, CreditCard, Home,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

const plans = [
  { id: "free", label: "Free", price: "€0/mo", description: "5 dataset base/mese — 5 ad per download", highlight: "Senza carta" },
  { id: "starter", label: "Starter", price: "€9.99/mo", description: "Dataset base illimitati, niente ads" },
  { id: "business", label: "Business", price: "€19.99/mo", description: "Dataset premium + richieste custom", popular: true },
  { id: "premium", label: "Premium", price: "Custom", description: "Enterprise: tutto illimitato + priorità" },
];

type Step = "dati" | "verifica";

interface FormData {
  firstName: string;
  lastName: string;
  vatCode: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  company: string;
  plan: string;
}

export default function Register() {
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>("dati");
  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    vatCode: "",
    address: "",
    postalCode: "",
    city: "",
    phone: "",
    email: "",
    company: "",
    plan: "free",
  });
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  const setField = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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
        body: JSON.stringify({ email: form.email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Errore invio codice"); return; }
      setStep("verifica");
      startCooldown();
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
      // Verify OTP
      const verifyRes = await fetch(`${API_BASE}/api/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim().toLowerCase(), code: fullCode }),
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        setError(verifyData.error ?? "Codice non valido");
        setCode(["", "", "", "", "", ""]);
        setTimeout(() => codeRefs.current[0]?.focus(), 50);
        return;
      }

      // OTP valid — create account with all collected data
      const regRes = await fetch(`${API_BASE}/api/auth/otp/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          postalCode: form.postalCode.trim(),
          city: form.city.trim(),
          vatCode: form.vatCode.trim() || null,
          company: form.company.trim() || null,
          plan: form.plan,
        }),
      });
      const regData = await regRes.json().catch(() => ({}));
      if (!regRes.ok) { setError(regData.error ?? "Errore registrazione"); return; }

      localStorage.setItem("pb_session_token", regData.token);
      localStorage.setItem("pb_client_id", String(regData.client.id));
      localStorage.setItem("pb_client_email", regData.client.email);
      localStorage.setItem("pb_client_name", `${regData.client.firstName} ${regData.client.lastName}`);
      localStorage.setItem("pb_client_company", regData.client.company ?? "");
      localStorage.setItem("pb_client_plan", form.plan);
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

  const stepLabels = ["Dati", "Verifica email"];
  const stepIndex = step === "dati" ? 0 : 1;

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
            {i < stepLabels.length - 1 && <div className={`h-px w-8 ${i < stepIndex ? "bg-primary" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      <Card className="w-full max-w-xl border-border bg-card">
        <CardHeader className="pb-4 text-center">
          {step === "dati" && (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <User className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">Crea il tuo account</h1>
              <p className="mt-1 text-sm text-muted-foreground">Compila i tuoi dati — poi verificheremo la tua email</p>
            </>
          )}
          {step === "verifica" && (
            <>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">Verifica email</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Codice inviato a <strong className="text-foreground">{form.email}</strong>
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

          {step === "dati" && (
            <form onSubmit={handleSendCode} className="space-y-4">
              {/* Piano */}
              <div>
                <p className="mb-2 text-sm font-medium">Scegli il piano</p>
                <div className="grid grid-cols-2 gap-2">
                  {plans.map((p) => (
                    <button key={p.id} type="button" onClick={() => setForm(f => ({ ...f, plan: p.id }))}
                      className={`relative rounded-lg border p-3 text-left transition-colors ${form.plan === p.id ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:border-primary/50"}`}>
                      {p.popular && <Badge className="absolute -top-2 right-1 text-[9px] px-1.5 py-0">Popolare</Badge>}
                      {(p as any).highlight && <Badge variant="secondary" className="absolute -top-2 left-1 text-[9px] px-1.5 py-0">{(p as any).highlight}</Badge>}
                      <p className="text-xs font-semibold">{p.label}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-primary">{p.price}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight">{p.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nome e Cognome */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName" className="text-xs">Nome *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="firstName" placeholder="Mario" className="pl-10"
                      value={form.firstName} onChange={setField("firstName")} required autoFocus />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName" className="text-xs">Cognome *</Label>
                  <Input id="lastName" placeholder="Rossi"
                    value={form.lastName} onChange={setField("lastName")} required />
                </div>
              </div>

              {/* P.IVA / Codice Fiscale */}
              <div className="space-y-1.5">
                <Label htmlFor="vatCode" className="text-xs">P.IVA o Codice Fiscale</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="vatCode" placeholder="IT12345678901 oppure RSSMRA80A01H501U"
                    className="pl-10" value={form.vatCode} onChange={setField("vatCode")} />
                </div>
              </div>

              {/* Azienda */}
              <div className="space-y-1.5">
                <Label htmlFor="company" className="text-xs">Azienda (opzionale)</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="company" placeholder="Acme S.r.l." className="pl-10"
                    value={form.company} onChange={setField("company")} />
                </div>
              </div>

              {/* Via */}
              <div className="space-y-1.5">
                <Label htmlFor="address" className="text-xs">Via e numero civico *</Label>
                <div className="relative">
                  <Home className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="address" placeholder="Via Roma 1" className="pl-10"
                    value={form.address} onChange={setField("address")} required />
                </div>
              </div>

              {/* CAP e Città */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="postalCode" className="text-xs">CAP *</Label>
                  <Input id="postalCode" placeholder="20100"
                    value={form.postalCode} onChange={setField("postalCode")} required maxLength={10} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city" className="text-xs">Città *</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="city" placeholder="Milano" className="pl-10"
                      value={form.city} onChange={setField("city")} required />
                  </div>
                </div>
              </div>

              {/* Telefono */}
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs">Numero di cellulare *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="phone" type="tel" placeholder="+39 333 1234567" className="pl-10"
                    value={form.phone} onChange={setField("phone")} required />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="mario@azienda.com" className="pl-10"
                    value={form.email} onChange={setField("email")} required />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  🔒 Ti invieremo un codice di verifica a questa email
                </p>
              </div>

              <Button type="submit" className="w-full" size="lg"
                disabled={loading || !form.firstName || !form.lastName || !form.email || !form.address || !form.postalCode || !form.city || !form.phone}>
                {loading ? "Invio codice…" : "Continua — Verifica email →"}
              </Button>
            </form>
          )}

          {step === "verifica" && (
            <div className="space-y-6">
              <div>
                <Label className="mb-3 block text-center text-sm">Inserisci il codice a 6 cifre</Label>
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
              <Button className="w-full" size="lg"
                disabled={loading || code.join("").length !== 6} onClick={() => handleVerifyCode()}>
                {loading ? "Creazione account…" : "Verifica e crea account →"}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" className="text-muted-foreground hover:text-foreground flex items-center gap-1.5"
                  onClick={() => { setStep("dati"); setCode(["","","","","",""]); setError(null); }}>
                  <RotateCcw className="h-3.5 w-3.5" /> Modifica dati
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

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Hai già un account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">Accedi</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
