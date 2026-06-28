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
        body: JSON.stringify({ name, email, message, source: "putitup-business" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Error while sending the message"); return; }
      setSent(true);
    } catch {
      setError("Connection error — please try again");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <CheckCircle2 className="w-14 h-14 text-primary" />
        <p className="font-bold text-lg">Message sent!</p>
        <p className="text-sm text-muted-foreground">We'll reply within 24 hours.</p>
        {onClose && <Button variant="outline" size="sm" onClick={onClose}>Close</Button>}
      </div>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <h3 className="font-bold text-lg">Contact us</h3>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded-full p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-destructive font-medium">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Tell us about your project, your dataset needs, or any question…"
              required
              rows={5}
              className="resize-none"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            <Send className="w-4 h-4 mr-2" />
            {loading ? "Sending…" : "Send message"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
