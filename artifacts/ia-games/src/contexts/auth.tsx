import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { API_BASE } from "@/lib/api";
import { saveSessionToken, getSessionToken, clearSessionToken } from "@/lib/session";

export interface AuthUser {
  id: number;
  username: string;
  walletAddress?: string | null;
  telegramId?: string | null;
  points: number;
  level: string;
  energy: number;
  maxEnergy: number;
  xp: number;
  streak: number;
  isAdmin: boolean;
  isSupervisor?: boolean;
  isModerator?: boolean;
  avatarUrl?: string | null;
  score: number;
}

export type AuthSource = "telegram" | "wallet" | "none";

interface AuthContextValue {
  user: AuthUser | null;
  source: AuthSource;
  isLoading: boolean;
  needsWalletConnect: boolean;
  needsNickname: boolean;
  pendingWallet: string | null;
  pendingTelegramId: string | null;
  wallet: ReturnType<typeof useTonWallet>;
  connectWallet: () => void;
  disconnectWallet: () => void;
  skipWalletConnect: () => void;
  completeRegistration: (username: string) => Promise<void>;
  cancelRegistration: () => void;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Persistenza sessione ───────────────────────────────────────────────────
const CACHE_KEY = "ia_uc";

function saveSession(userId: number, source: AuthSource) {
  localStorage.setItem("ia_games_user_id", String(userId));
  localStorage.setItem("ia_games_auth_source", source);
}

function loadSession(): { userId: number; source: AuthSource } | null {
  const id = localStorage.getItem("ia_games_user_id");
  const src = localStorage.getItem("ia_games_auth_source") as AuthSource;
  if (id && src) return { userId: parseInt(id, 10), source: src };
  return null;
}

function clearSession() {
  localStorage.removeItem("ia_games_user_id");
  localStorage.removeItem("ia_games_auth_source");
  localStorage.removeItem(CACHE_KEY);
  clearSessionToken();
}

/** Salva dati utente in cache per accesso istantaneo al prossimo avvio */
function cacheUser(user: AuthUser) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(user)); } catch {}
}

/** Restituisce l'utente cached sincronamente (null se assente) */
function getCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch { return null; }
}

// ─── Fetch API ──────────────────────────────────────────────────────────────
async function apiFetch(path: string, options?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000); // 8s max (era 20s)
  try {
    const token = getSessionToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options?.headers as Record<string, string>) ?? {}),
    };
    if (token && !headers["Authorization"]) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
      ...options,
      headers,
    });
    if (!res.ok && res.status !== 404) throw new Error(`API error ${res.status}`);
    if (res.status === 404) return null;
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function getTelegramUser(): { id: string; username?: string } | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user?.id) {
      return { id: String(tg.initDataUnsafe.user.id), username: tg.initDataUnsafe.user.username };
    }
  } catch {}
  return null;
}

/** Raw signed initData string used for server-side HMAC validation. */
function getTelegramInitData(): string | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const data = tg?.initData;
    return typeof data === "string" && data.length > 0 ? data : null;
  } catch {}
  return null;
}

// ─── Provider ───────────────────────────────────────────────────────────────
function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();

  // Inizializza subito dall'utente in cache (può essere null)
  const [user, setUser] = useState<AuthUser | null>(() => {
    const session = loadSession();
    if (!session) return null;
    return getCachedUser(); // istantaneo, sincrono — nessuna attesa
  });

  const [source, setSource] = useState<AuthSource>(() => {
    return (localStorage.getItem("ia_games_auth_source") as AuthSource) ?? "none";
  });

  // isLoading = false subito se abbiamo già un utente in cache
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    const session = loadSession();
    if (!session) return false; // nessuna sessione → login screen subito
    return getCachedUser() === null; // loading solo se non c'è cache
  });

  const [needsWalletConnect, setNeedsWalletConnect] = useState(false);
  const [needsNickname, setNeedsNickname] = useState(false);
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);
  const [pendingTelegramId, setPendingTelegramId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const setAndCacheUser = useCallback((u: AuthUser) => {
    setUser(u);
    cacheUser(u);
  }, []);

  const loadUserById = useCallback(async (id: number): Promise<AuthUser | null> => {
    try {
      const u = await apiFetch(`/api/users/${id}`);
      if (u) { setAndCacheUser(u as AuthUser); return u as AuthUser; }
    } catch {}
    return null;
  }, [setAndCacheUser]);

  const refreshUser = useCallback(async () => {
    if (user?.id) await loadUserById(user.id);
  }, [user?.id, loadUserById]);

  /**
   * Securely log in (or refresh the session token for) a Telegram user using
   * the signed initData string. Returns the DB user when the account already
   * exists, `"needs-registration"` when initData is valid but no account exists,
   * or null when validation is unavailable/failed.
   */
  const validateTelegram = useCallback(
    async (
      initData: string,
    ): Promise<AuthUser | "needs-registration" | null> => {
      try {
        const r = await apiFetch("/api/auth/telegram/validate", {
          method: "POST",
          body: JSON.stringify({ initData }),
        });
        if (!r?.valid) return null;
        if (r.token) saveSessionToken(r.token as string);
        if (r.user) {
          setAndCacheUser(r.user as AuthUser);
          return r.user as AuthUser;
        }
        return "needs-registration";
      } catch {
        return null;
      }
    },
    [setAndCacheUser],
  );

  /** Background top-up: ensure a returning session has a fresh token. */
  const ensureSessionToken = useCallback(async () => {
    if (getSessionToken()) return;
    const initData = getTelegramInitData();
    if (initData) {
      await validateTelegram(initData);
    }
  }, [validateTelegram]);

  // ─── Inizializzazione ──────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const session = loadSession();

      if (session) {
        // Se abbiamo già l'utente dalla cache, mostriamo subito (isLoading già false)
        // poi validiamo in background senza bloccare la UI
        const cached = getCachedUser();

        if (cached) {
          // Utente visibile subito — revalidate silenzioso in background
          setInitialized(true);
          // Top-up del token di sessione (per utenti Telegram di ritorno) senza bloccare la UI
          void ensureSessionToken();
          loadUserById(session.userId).then((fresh) => {
            if (!fresh) {
              // Sessione non più valida
              clearSession();
              setUser(null);
              setSource("none");
            }
          });
          return;
        }

        // Nessuna cache: chiamata bloccante (prima visita dopo login)
        void ensureSessionToken();
        const u = await loadUserById(session.userId);
        if (u) {
          setSource(session.source);
          setInitialized(true);
          setIsLoading(false);
          return;
        }
        clearSession();
      }

      // ── Nessuna sessione: Telegram login ──
      const tgInitData = getTelegramInitData();
      const tgUser = getTelegramUser();
      if (tgInitData || tgUser) {
        // Percorso sicuro: validazione HMAC dell'initData firmato
        if (tgInitData) {
          const result = await validateTelegram(tgInitData);
          if (result && result !== "needs-registration") {
            setSource("telegram");
            saveSession(result.id, "telegram");
            setInitialized(true);
            setIsLoading(false);
            return;
          }
          if (result === "needs-registration") {
            if (tgUser) setPendingTelegramId(tgUser.id);
            setNeedsWalletConnect(true);
            setInitialized(true);
            setIsLoading(false);
            return;
          }
          // result === null → validazione non disponibile, fallback legacy sotto
        }
        // Fallback legacy (modalità soft): lookup per telegramId senza token
        if (tgUser) {
          try {
            const u = await apiFetch(`/api/users/by-telegram/${tgUser.id}`);
            if (u) {
              setAndCacheUser(u as AuthUser);
              setSource("telegram");
              saveSession((u as AuthUser).id, "telegram");
              setInitialized(true);
              setIsLoading(false);
              return;
            }
          } catch {}
          setPendingTelegramId(tgUser.id);
          setNeedsWalletConnect(true);
          setInitialized(true);
          setIsLoading(false);
          return;
        }
      }

      setInitialized(true);
      setIsLoading(false);
    };

    init().catch(() => { setInitialized(true); setIsLoading(false); });
  }, []);

  // ─── Cambio stato wallet ───────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return;
    if (wallet) {
      const addr = wallet.account.address;
      if (user?.walletAddress === addr) {
        // Utente wallet di ritorno: assicura un token di sessione se mancante
        if (!getSessionToken()) {
          apiFetch(`/api/users/by-wallet/${addr}`).then((u) => {
            if (u && (u as any).token) saveSessionToken((u as any).token as string);
          }).catch(() => {});
        }
        return;
      }
      if (user) {
        apiFetch(`/api/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: addr }),
        }).then((updated) => {
          if (updated) setAndCacheUser(updated as AuthUser);
        }).catch(() => {});
        return;
      }
      apiFetch(`/api/users/by-wallet/${addr}`).then((u) => {
        if (u) {
          if ((u as any).token) saveSessionToken((u as any).token as string);
          setAndCacheUser(u as AuthUser);
          setSource("wallet");
          saveSession((u as AuthUser).id, "wallet");
          setNeedsNickname(false);
          setNeedsWalletConnect(false);
          // Link telegram_id if we are inside Telegram and it isn't saved yet
          const tgUser = getTelegramUser();
          if (tgUser && !(u as AuthUser).telegramId) {
            apiFetch(`/api/users/${(u as AuthUser).id}`, {
              method: "PATCH",
              body: JSON.stringify({ telegramId: tgUser.id }),
            }).then((updated) => {
              if (updated) setAndCacheUser(updated as AuthUser);
            }).catch(() => {});
          }
          setPendingWallet(null);
        } else {
          setPendingWallet(addr);
          setNeedsWalletConnect(false);
          setNeedsNickname(true);
        }
      }).catch(() => {
        setPendingWallet(addr);
        setNeedsWalletConnect(false);
        setNeedsNickname(true);
      });
    } else {
      if (source === "wallet") {
        clearSession();
        setUser(null);
        setSource("none");
        setNeedsNickname(false);
        setNeedsWalletConnect(false);
        setPendingWallet(null);
      }
    }
  }, [wallet, initialized]);

  const connectWallet    = useCallback(() => tonConnectUI.openModal(), [tonConnectUI]);
  const disconnectWallet = useCallback(() => tonConnectUI.disconnect(), [tonConnectUI]);

  const completeRegistration = useCallback(async (username: string) => {
    if (!pendingWallet && !pendingTelegramId) throw new Error("Identity not available");
    const body: Record<string, unknown> = { username };
    if (pendingWallet) body.walletAddress = pendingWallet;
    if (pendingTelegramId) {
      body.telegramId = pendingTelegramId;
      // Include signed initData so the server can verify Telegram ownership and
      // mint a session token (a bare telegramId is never trusted for issuance).
      const initData = getTelegramInitData();
      if (initData) body.initData = initData;
    }
    const u = await apiFetch("/api/users", { method: "POST", body: JSON.stringify(body) });
    if (!u) throw new Error("Registrazione fallita");
    if ((u as any).token) saveSessionToken((u as any).token as string);
    setAndCacheUser(u as AuthUser);
    const src = pendingTelegramId ? "telegram" : "wallet";
    setSource(src);
    saveSession((u as AuthUser).id, src);
    setNeedsNickname(false);
    setPendingWallet(null);
    setPendingTelegramId(null);
  }, [pendingWallet, pendingTelegramId, setAndCacheUser]);

  const skipWalletConnect = useCallback(() => {
    setNeedsWalletConnect(false);
    setNeedsNickname(true);
  }, []);

  const cancelRegistration = useCallback(() => {
    setNeedsNickname(false);
    setPendingWallet(null);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setSource("none");
    setNeedsNickname(false);
    setPendingWallet(null);
    setPendingTelegramId(null);
    tonConnectUI.disconnect();
  }, [tonConnectUI]);

  return (
    <AuthContext.Provider value={{
      user, source, isLoading, needsWalletConnect, needsNickname,
      pendingWallet, pendingTelegramId, wallet,
      connectWallet, disconnectWallet, skipWalletConnect,
      completeRegistration, cancelRegistration, refreshUser, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContextProvider>{children}</AuthContextProvider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
