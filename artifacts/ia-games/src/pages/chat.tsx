import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth";
import { API_BASE } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { Send, MessageCircle, Lock, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ChatMsg {
  id: number;
  userId: number;
  username: string;
  content: string;
  createdAt: string;
}

const POLL_INTERVAL = 4000;

function authHeaders(): Record<string, string> {
  const token = getSessionToken();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export default function Chat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canModerate, setCanModerate] = useState<boolean>(!!user?.isAdmin);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/messages?limit=60`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch {}
  };

  useEffect(() => {
    if (!user) return;
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user]);

  // Resolve the current user's moderation role (admin or appointed moderator).
  useEffect(() => {
    if (!user) return;
    let active = true;
    setCanModerate(!!user.isAdmin);
    fetch(`${API_BASE}/api/users/${user.id}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (active && u) setCanModerate(Boolean(u.isAdmin || u.isModerator));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || !user || sending) return;
    const content = text.trim();
    setText("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/chat/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ userId: user.id, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Errore invio"); setText(content); return; }
      await fetchMessages();
    } catch {
      setError("Errore di connessione");
      setText(content);
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (id: number) => {
    if (!user) return;
    const prev = messages;
    setMessages((m) => m.filter((msg) => msg.id !== id));
    try {
      const res = await fetch(`${API_BASE}/api/chat/messages/${id}?userId=${user.id}`, {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        setMessages(prev);
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Impossibile eliminare il messaggio");
      }
    } catch {
      setMessages(prev);
      setError("Errore di connessione");
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] gap-4 px-6 text-center">
        <Lock className="w-12 h-12 text-muted-foreground" />
        <h2 className="font-black text-lg">Accesso richiesto</h2>
        <p className="text-sm text-muted-foreground">Connetti il tuo wallet per partecipare alla chat della community.</p>
      </div>
    );
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-120px)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-card/50 flex-shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
          <MessageCircle className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="font-black text-sm">Community Chat</p>
          <p className="text-[10px] text-muted-foreground">Solo utenti verificati</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 overscroll-contain">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center opacity-50">
            <MessageCircle className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nessun messaggio ancora.<br />Sii il primo a scrivere!</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.userId === user.id;
          const canDelete = isMine || canModerate;
          return (
            <div key={msg.id} className={`flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar */}
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black ${isMine ? "bg-primary/30 text-primary" : "bg-muted text-muted-foreground"}`}>
                {msg.username.charAt(0).toUpperCase()}
              </div>
              {/* Bubble */}
              <div className={`max-w-[75%] ${isMine ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                {!isMine && (
                  <span className="text-[9px] font-bold text-muted-foreground px-1">{msg.username}</span>
                )}
                <div className={`rounded-2xl px-3 py-2 text-sm break-words ${
                  isMine
                    ? "bg-primary/20 text-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                }`}>
                  {msg.content}
                </div>
                <div className={`flex items-center gap-2 px-1 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="text-[9px] text-muted-foreground">{formatTime(msg.createdAt)}</span>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => deleteMessage(msg.id)}
                      aria-label="Elimina messaggio"
                      className="text-muted-foreground/60 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-border/40 px-3 py-2 bg-card/50">
        {error && <p className="text-[10px] text-destructive mb-1 font-semibold">{error}</p>}
        <form onSubmit={sendMessage} className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Scrivi un messaggio…"
            className="flex-1 h-9 text-sm bg-muted/50 border-border/40"
            maxLength={500}
            autoComplete="off"
          />
          <Button
            type="submit"
            size="sm"
            className="h-9 w-9 p-0 shrink-0"
            disabled={!text.trim() || sending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
