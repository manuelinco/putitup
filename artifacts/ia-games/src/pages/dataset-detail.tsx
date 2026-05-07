import { useGetDataset } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Star, Play, Lock, Database, ChevronLeft, CheckCircle, Shield, UserPlus, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ClientAccount {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  company?: string | null;
  tokenBalance: number;
  adsWatchedToday: number;
  riskScore: number;
  isBlocked: boolean;
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `API error ${res.status}`);
  return data;
}

export default function DatasetDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);
  const { data: dataset, isLoading } = useGetDataset(id, { query: { enabled: !!id } as any });
  const [client, setClient] = useState<ClientAccount | null>(null);
  const [clientForm, setClientForm] = useState({ firstName: "", lastName: "", email: "", phone: "", address: "", company: "" });
  const [adsWatched, setAdsWatched] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const savedId = localStorage.getItem("ia_games_client_id");
    if (!savedId) return;
    apiFetch(`/api/clients/${savedId}`).then(setClient).catch(() => localStorage.removeItem("ia_games_client_id"));
  }, []);

  const handleRegisterClient = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const created = await apiFetch("/api/clients", {
        method: "POST",
        body: JSON.stringify(clientForm),
      });
      setClient(created);
      localStorage.setItem("ia_games_client_id", String(created.id));
      setMessage("Profilo cliente salvato. Ora puoi sbloccare i dataset.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Registrazione fallita");
    } finally {
      setBusy(false);
    }
  };

  const handleWatchAd = async () => {
    if (!client || !dataset) return;
    setBusy(true);
    setMessage(null);
    try {
      const completionToken = `ad_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const result = await apiFetch(`/api/clients/${client.id}/ads/watch`, {
        method: "POST",
        body: JSON.stringify({ datasetId: dataset.id, durationSeconds: 30, completionToken }),
      });
      setClient(result.client);
      setAdsWatched((p) => p + 1);
      setMessage(`Ad completato: +${result.tokensEarned} token dataset.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ad non valido o cooldown anti-bot attivo");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async (method: "tokens" | "payment" | "free") => {
    if (!client || !dataset) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/api/clients/${client.id}/datasets/${dataset.id}/unlock`, {
        method: "POST",
        body: JSON.stringify({ method }),
      });
      if (method === "tokens") {
        setClient({ ...client, tokenBalance: client.tokenBalance - ((dataset as any).tokenCost || dataset.adsRequired || 0) });
      }
      setDownloaded(true);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Download non autorizzato");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (!dataset) {
    return (
      <Layout>
        <div className="p-8 text-center space-y-3">
          <Database className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="font-bold">Dataset not found</p>
          <Link href="/datasets">
            <Button variant="outline" size="sm">Back to Datasets</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const adsNeeded = dataset.adsRequired ?? 3;
  const tokenCost = (dataset as any).tokenCost || adsNeeded;
  const adsProgress = Math.min(adsWatched / adsNeeded, 1) * 100;
  const canDownloadWithTokens = !!client && client.tokenBalance >= tokenCost;

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <Link href="/datasets">
          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
            Back to Datasets
          </button>
        </Link>

        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-black leading-tight">{dataset.name}</h1>
            <Badge variant="outline" className={cn(
              "text-[10px] flex-shrink-0",
              dataset.accessType === "free" ? "text-secondary border-secondary/40 bg-secondary/10" :
              dataset.accessType === "ads" ? "text-accent border-accent/40 bg-accent/10" :
              "text-primary border-primary/40 bg-primary/10"
            )}>
              {dataset.accessType === "free" ? "Free" : dataset.accessType === "ads" ? "Ads / Tokens" : "Premium"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{dataset.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-3 text-center">
              <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Quality</div>
              <div className="text-xl font-black text-secondary">{dataset.qualityScore}%</div>
              <Progress value={dataset.qualityScore} className="h-1 mt-1.5" />
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-3 text-center">
              <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Records</div>
              <div className="text-xl font-black text-primary">{((dataset as any).approvedRecordCount || dataset.recordCount || 0).toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/50">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Dataset Info</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            {[
              { label: "Category", value: dataset.category },
              { label: "Workflow", value: (dataset as any).workflowMode ?? "consensus" },
              { label: "Consensus", value: `${Math.round(((dataset as any).consensusThreshold ?? 0.8) * 100)}% · ${(dataset as any).votesRequired ?? 3} votes` },
              { label: "Tokens", value: `${tokenCost} token` },
              { label: "Price", value: dataset.price ? `$${dataset.price.toFixed(2)}` : "N/A" },
              { label: "Last nightly update", value: (dataset as any).nightlyPublishedAt ? new Date((dataset as any).nightlyPublishedAt).toLocaleDateString() : "Pending" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm gap-3">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold text-right">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {!client && (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <UserPlus className="w-3.5 h-3.5" />
                Client Registration Required
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className="p-2 rounded-lg bg-muted/40 border border-border/50 text-xs" placeholder="Nome" value={clientForm.firstName} onChange={(e) => setClientForm({ ...clientForm, firstName: e.target.value })} />
                <input className="p-2 rounded-lg bg-muted/40 border border-border/50 text-xs" placeholder="Cognome" value={clientForm.lastName} onChange={(e) => setClientForm({ ...clientForm, lastName: e.target.value })} />
              </div>
              <input className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs" placeholder="Email" value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} />
              <input className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs" placeholder="Telefono" value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} />
              <input className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs" placeholder="Indirizzo" value={clientForm.address} onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })} />
              <input className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs" placeholder="Azienda / P.IVA (opzionale)" value={clientForm.company} onChange={(e) => setClientForm({ ...clientForm, company: e.target.value })} />
              <Button className="w-full font-bold" onClick={handleRegisterClient} disabled={busy || !clientForm.firstName || !clientForm.lastName || !clientForm.email || !clientForm.phone || !clientForm.address}>
                Salva profilo cliente
              </Button>
            </CardContent>
          </Card>
        )}

        {client && (
          <Card className="border-secondary/30 bg-secondary/5">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-black">{client.firstName} {client.lastName}</p>
                <p className="text-[10px] text-muted-foreground">Risk score {client.riskScore}/100 · Ads oggi {client.adsWatchedToday}</p>
              </div>
              <Badge variant="outline" className="text-secondary border-secondary/40 flex items-center gap-1">
                <Coins className="w-3 h-3" />
                {client.tokenBalance} token
              </Badge>
            </CardContent>
          </Card>
        )}

        {message && (
          <div className="text-xs text-center p-2 rounded-lg border border-border/40 bg-muted/30 text-muted-foreground">
            {message}
          </div>
        )}

        {downloaded ? (
          <Card className="border-secondary/40 bg-secondary/10">
            <CardContent className="p-4 flex items-center justify-center gap-3">
              <CheckCircle className="w-6 h-6 text-secondary" />
              <div>
                <p className="font-bold text-secondary">Download unlocked!</p>
                <p className="text-xs text-muted-foreground">Dataset access granted after checks</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-accent/40 bg-accent/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-accent">Unlock Dataset</span>
                <span className="text-xs text-muted-foreground">{tokenCost} token oppure fee</span>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Ads session progress</span>
                  <span className="font-bold text-accent">{adsWatched}/{adsNeeded}</span>
                </div>
                <Progress value={adsProgress} className="h-2" />
              </div>
              <Button variant="outline" className="w-full font-bold border-accent/40 text-accent" onClick={handleWatchAd} disabled={busy || !client}>
                <Play className="w-4 h-4 mr-2" />
                Watch verified Ad (+2 token)
              </Button>
              <Button className="w-full font-bold" onClick={() => handleUnlock(dataset.accessType === "free" ? "free" : "tokens")} disabled={busy || !client || (dataset.accessType !== "free" && !canDownloadWithTokens)}>
                <Download className="w-4 h-4 mr-2" />
                Unlock with Tokens
              </Button>
              <Button variant="outline" className="w-full font-bold border-primary/40 text-primary" onClick={() => handleUnlock("payment")} disabled={busy || !client}>
                <Lock className="w-4 h-4 mr-2" />
                Pay fee instead {dataset.price ? `($${dataset.price.toFixed(2)})` : ""}
              </Button>
              <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
                <Shield className="w-3 h-3" />
                Anti-bot: cooldown, daily cap, completion token, risk score
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
