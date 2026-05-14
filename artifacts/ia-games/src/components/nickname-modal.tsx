import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, CheckCircle, XCircle, Loader2, User, AlertCircle, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";

async function fetchWithTimeout(url: string, ms = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function NicknameModal() {
  const { completeRegistration, cancelRegistration, connectWallet, pendingWallet, pendingTelegramId } = useAuth();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (username.length < 3) {
      setStatus("idle");
      return;
    }
    const t = setTimeout(async () => {
      setStatus("checking");
      try {
        const res = await fetchWithTimeout(`${API_BASE}/api/users/check-username/${encodeURIComponent(username)}`);
        const data = await res.json();
        if (data.available) {
          setStatus("available");
        } else {
          setStatus(data.reason ? "invalid" : "taken");
          setReason(data.reason ?? "Username already taken");
        }
      } catch {
        setStatus("idle");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username]);

  const handleSubmit = async () => {
    if (status !== "available" || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await completeRegistration(username);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registrazione fallita";
      setSubmitError(
        msg.includes("abort") || msg.toLowerCase().includes("timeout") || msg.includes("signal")
          ? "Server in avvio, riprova tra 10 secondi."
          : msg
      );
      setSubmitting(false);
    }
  };

  const isTelegramOnly = !!pendingTelegramId && !pendingWallet;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md p-4">
      <Card className="w-full max-w-sm border-primary/40 bg-card shadow-[0_0_60px_rgba(168,85,247,0.2)]">
        <CardContent className="p-6 space-y-5">
          {/* Icon */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-primary/20 border-2 border-primary/50 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(168,85,247,0.3)]">
              <User className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Scegli il tuo username</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {pendingWallet
                  ? <><span className="text-primary font-semibold">{pendingWallet.slice(0, 8)}…{pendingWallet.slice(-4)}</span> connesso!</>
                  : pendingTelegramId
                    ? <><span className="text-primary font-semibold">Telegram</span> verificato!</>
                    : "Connetti un'identità per procedere."
                }{" "}Scegli un nome unico per iniziare a guadagnare.
              </p>
            </div>
          </div>

          {/* Username input */}
          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20));
                  setSubmitError("");
                }}
                placeholder="es. DataHunter99"
                className={cn(
                  "w-full px-4 py-3 rounded-xl bg-muted/40 border text-sm font-semibold placeholder:text-muted-foreground focus:outline-none transition-all pr-10",
                  status === "available" ? "border-secondary/60 focus:border-secondary" :
                  status === "taken" || status === "invalid" ? "border-destructive/60 focus:border-destructive" :
                  "border-border/50 focus:border-primary/50"
                )}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoFocus
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {status === "checking" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                {status === "available" && <CheckCircle className="w-4 h-4 text-secondary" />}
                {(status === "taken" || status === "invalid") && <XCircle className="w-4 h-4 text-destructive" />}
              </div>
            </div>

            <div className="min-h-4">
              {status === "available" && <p className="text-[11px] text-secondary font-semibold">✓ Disponibile!</p>}
              {(status === "taken" || status === "invalid") && <p className="text-[11px] text-destructive">{reason || "Username non disponibile"}</p>}
              {status === "idle" && username.length > 0 && username.length < 3 && <p className="text-[11px] text-muted-foreground">Minimo 3 caratteri</p>}
            </div>
            <p className="text-[10px] text-muted-foreground">Lettere, numeri e underscore. 3–20 caratteri.</p>
          </div>

          {/* Optional TON wallet (for Telegram users) */}
          {isTelegramOnly && (
            <button
              type="button"
              onClick={connectWallet}
              className="w-full flex items-center gap-2 justify-center rounded-xl border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 py-2.5 px-4 text-xs font-semibold text-primary/80 transition-all"
            >
              <Wallet className="w-3.5 h-3.5" />
              Collega TON Wallet (opzionale)
            </button>
          )}

          {/* Submit error */}
          {submitError && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{submitError}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="space-y-2">
            <Button
              className="w-full font-bold text-base h-12 shadow-[0_0_20px_rgba(168,85,247,0.3)]"
              disabled={status !== "available" || submitting}
              onClick={handleSubmit}
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creazione account...</>
                : <><Zap className="w-4 h-4 mr-2" /> Inizia a guadagnare</>
              }
            </Button>

            {!pendingTelegramId && (
              <button
                type="button"
                onClick={cancelRegistration}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                Annulla
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
