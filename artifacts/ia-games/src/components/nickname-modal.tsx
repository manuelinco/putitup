import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, CheckCircle, XCircle, Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function NicknameModal() {
  const { completeRegistration, pendingWallet, pendingTelegramId } = useAuth();
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (username.length < 3) {
      setStatus("idle");
      return;
    }
    const t = setTimeout(async () => {
      setStatus("checking");
      try {
        const res = await fetch(`${API_BASE}/api/users/check-username/${encodeURIComponent(username)}`);
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
    try {
      await completeRegistration(username);
    } catch {
      setSubmitting(false);
    }
  };

  const displaySource = pendingTelegramId ? "Telegram" : pendingWallet
    ? `${pendingWallet.slice(0, 6)}...${pendingWallet.slice(-4)}`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md p-4">
      <Card className="w-full max-w-sm border-primary/40 bg-card shadow-[0_0_60px_rgba(168,85,247,0.2)]">
        <CardContent className="p-6 space-y-6">
          {/* Icon */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/50 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(168,85,247,0.3)]">
              <User className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Scegli il tuo nickname</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {displaySource && <span className="text-primary font-semibold">{displaySource}</span>}
                {" "}connesso! Scegli un nome univoco per iniziare.
              </p>
            </div>
          </div>

          {/* Input */}
          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20))}
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

            {/* Feedback */}
            <div className="h-4">
              {status === "available" && (
                <p className="text-[11px] text-secondary font-semibold">✓ Disponibile!</p>
              )}
              {(status === "taken" || status === "invalid") && (
                <p className="text-[11px] text-destructive">{reason || "Username non disponibile"}</p>
              )}
              {status === "idle" && username.length > 0 && username.length < 3 && (
                <p className="text-[11px] text-muted-foreground">Minimo 3 caratteri</p>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground">
              Solo lettere, numeri e underscore. 3-20 caratteri.
            </p>
          </div>

          {/* Submit */}
          <Button
            className="w-full font-bold text-base h-12 shadow-[0_0_20px_rgba(168,85,247,0.3)]"
            disabled={status !== "available" || submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creazione...</>
            ) : (
              <><Zap className="w-4 h-4 mr-2" /> Inizia a guadagnare</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
