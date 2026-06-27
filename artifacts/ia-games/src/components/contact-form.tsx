import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CheckCircle2, Send, X } from "lucide-react";
import { API_BASE } from "@/lib/api";

interface ContactFormProps {
  onClose?: () => void;
}

export function ContactForm({ onClose }: ContactFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, source: "ia-games" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Errore invio"); return; }
      setSent(true);
    } catch {
      setError("Errore di connessione — riprova");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-secondary" />
        <p className="font-black text-secondary">Messaggio inviato!</p>
        <p className="text-sm text-muted-foreground">Ti risponderemo presto.</p>
        {onClose && <Button variant="outline" size="sm" onClick={onClose}>Chiudi</Button>}
      </div>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <h3 className="font-black text-base">Contattaci</h3>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-xs text-destructive font-semibold">{error}</p>}
          <div className="space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Il tuo nome" required className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Messaggio</Label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Scrivi qui il tuo messaggio…" required rows={4} className="text-sm resize-none" />
          </div>
          <Button type="submit" className="w-full h-9" disabled={loading}>
            <Send className="w-4 h-4 mr-2" />
            {loading ? "Invio…" : "Invia messaggio"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
