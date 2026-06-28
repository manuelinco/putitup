import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth, type AuthUser } from "@/contexts/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield, UserPlus, KeyRound, LogIn, Loader2, CheckCircle,
  AlertCircle, ClipboardList, LayoutDashboard,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

const PW_RE = /^[A-Za-z0-9]{16}$/;

const inputCls =
  "w-full p-2.5 rounded-lg bg-muted/40 border border-border/50 text-sm outline-none focus:border-primary/60 placeholder:text-muted-foreground/50";

export function StaffAccess() {
  const { user, loginStaff } = useAuth();
  const [, navigate] = useLocation();
  const isStaff = !!user && (user.isAdmin || user.isSupervisor);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Forced / voluntary password change
  const [forced, setForced] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");

  // Logged-in staff panels
  const [panel, setPanel] = useState<"none" | "change" | "createSup">("none");
  const [supEmail, setSupEmail] = useState("");
  const [supUsername, setSupUsername] = useState("");
  const [supPassword, setSupPassword] = useState("");

  const resetMsgs = () => { setError(null); setInfo(null); };

  const handleLogin = async () => {
    resetMsgs();
    if (!email || !password) { setError("Inserisci email e password."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/staff/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Credenziali non valide");
      setPassword("");
      if (data.mustChangePassword) {
        setPendingToken(data.token);
        setForced(true);
      } else {
        loginStaff(data.user as AuthUser, data.token);
        navigate(`/profile/${data.user.id}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = async () => {
    resetMsgs();
    if (!PW_RE.test(newPw)) {
      setError("La password deve avere esattamente 16 caratteri, solo lettere e numeri.");
      return;
    }
    const token = forced ? pendingToken : getSessionToken();
    if (!token) { setError("Sessione non valida. Effettua di nuovo l'accesso."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/staff/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: newPw }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Errore durante il cambio password");
      setNewPw("");
      if (forced) {
        // change-password returns a fresh full-privilege staff token + user.
        loginStaff(data.user as AuthUser, data.token);
        setForced(false);
        setPendingToken(null);
        navigate(`/profile/${data.user.id}`);
      } else {
        setPanel("none");
        setInfo("Password aggiornata con successo.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSup = async () => {
    resetMsgs();
    const token = getSessionToken();
    if (!token) { setError("Sessione non valida."); return; }
    if (!supEmail || !supUsername || !supPassword) {
      setError("Compila email, username e password iniziale.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/staff/supervisors`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: supEmail, username: supUsername, password: supPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Errore nella creazione del supervisor");
      setInfo(`Supervisor creato: ${supUsername} (${supEmail}). Dovrà cambiare la password al primo accesso.`);
      setSupEmail(""); setSupUsername(""); setSupPassword("");
      setPanel("none");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Forced password change (first login) ──────────────────────────────────
  if (forced) {
    const valid = PW_RE.test(newPw);
    return (
      <Card className="border-red-500/40 bg-red-500/5">
        <CardHeader className="p-3 pb-2 border-b border-border/30">
          <CardTitle className="text-xs uppercase tracking-wider text-red-400 flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5" />
            Imposta una nuova password
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Per motivi di sicurezza devi impostare una nuova password di
            <span className="font-bold text-foreground"> esattamente 16 caratteri</span> (solo
            lettere e numeri) prima di continuare.
          </p>
          <input
            type="password"
            className={inputCls}
            placeholder="Nuova password (16 caratteri)"
            value={newPw}
            maxLength={16}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <p className={`text-[10px] ${valid ? "text-secondary" : "text-muted-foreground"}`}>
            {newPw.length}/16 caratteri {valid ? "✓" : ""}
          </p>
          <Button
            className="w-full font-bold"
            onClick={handleChange}
            disabled={loading || !valid}
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            Imposta password e accedi
          </Button>
          {error && (
            <p className="text-[11px] text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Main staff card ───────────────────────────────────────────────────────
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="p-3 pb-2 border-b border-border/30">
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-primary" />
          Area Staff
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {!isStaff ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              Accesso riservato ad amministratori e supervisori.
            </p>
            <input
              type="email"
              className={inputCls}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              className={inputCls}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
            />
            <Button className="w-full font-bold" onClick={handleLogin} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
              Accedi
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold">{user!.username}</span>
              {user!.isAdmin && (
                <Badge variant="outline" className="text-[9px] text-primary border-primary/50 bg-primary/10">
                  ADMIN
                </Badge>
              )}
              {user!.isSupervisor && (
                <Badge variant="outline" className="text-[9px] text-accent border-accent/50 bg-accent/10">
                  SUPERVISOR
                </Badge>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full justify-start text-sm border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => navigate("/controller")}
            >
              <ClipboardList className="w-4 h-4 mr-2" /> Coda di revisione
            </Button>

            {user!.isAdmin && (
              <Button
                variant="outline"
                className="w-full justify-start text-sm border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => navigate("/admin")}
              >
                <LayoutDashboard className="w-4 h-4 mr-2" /> Pannello Admin
              </Button>
            )}

            {user!.isAdmin && (
              <Button
                variant="outline"
                className="w-full justify-start text-sm"
                onClick={() => { resetMsgs(); setPanel(panel === "createSup" ? "none" : "createSup"); }}
              >
                <UserPlus className="w-4 h-4 mr-2" /> Crea supervisor
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full justify-start text-sm"
              onClick={() => { resetMsgs(); setPanel(panel === "change" ? "none" : "change"); }}
            >
              <KeyRound className="w-4 h-4 mr-2" /> Cambia password
            </Button>

            {panel === "change" && (
              <div className="space-y-2 pt-1 border-t border-border/30">
                <input
                  type="password"
                  className={inputCls}
                  placeholder="Nuova password (16 caratteri)"
                  value={newPw}
                  maxLength={16}
                  onChange={(e) => setNewPw(e.target.value)}
                />
                <p className={`text-[10px] ${PW_RE.test(newPw) ? "text-secondary" : "text-muted-foreground"}`}>
                  {newPw.length}/16 caratteri (solo lettere e numeri)
                </p>
                <Button
                  className="w-full font-bold"
                  onClick={handleChange}
                  disabled={loading || !PW_RE.test(newPw)}
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Salva nuova password
                </Button>
              </div>
            )}

            {panel === "createSup" && (
              <div className="space-y-2 pt-1 border-t border-border/30">
                <input
                  type="email"
                  className={inputCls}
                  placeholder="Email supervisor"
                  value={supEmail}
                  onChange={(e) => setSupEmail(e.target.value)}
                />
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Username"
                  value={supUsername}
                  onChange={(e) => setSupUsername(e.target.value)}
                />
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Password iniziale"
                  value={supPassword}
                  onChange={(e) => setSupPassword(e.target.value)}
                />
                <Button className="w-full font-bold" onClick={handleCreateSup} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                  Crea supervisor
                </Button>
              </div>
            )}
          </>
        )}

        {error && (
          <p className="text-[11px] text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </p>
        )}
        {info && (
          <p className="text-[11px] text-secondary flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> {info}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
