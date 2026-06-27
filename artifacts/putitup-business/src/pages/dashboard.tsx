import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import { AdminPanel } from "@/components/admin-panel";
import { useBusinessAuth } from "@/hooks/useBusinessAuth";
import {
  ArrowUpRight, BarChart3, Building2, Database, Download,
  Lock, LogOut, Mail, ShieldCheck, User, Zap,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

interface UnlockedDataset {
  id: number;
  datasetId: number;
  method: string;
  tokensSpent: number;
  grantedAt: string;
  dataset: {
    id: number;
    name: string;
    description: string;
    category: string;
    qualityScore: number | null;
    recordCount: number | null;
    status: string;
  } | null;
}

const PLAN_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  free:     { label: "Free",     color: "bg-muted text-muted-foreground border-border",          desc: "5 dataset base/mese via ads" },
  starter:  { label: "Starter",  color: "bg-blue-500/10 text-blue-400 border-blue-500/30",       desc: "Dataset base illimitati" },
  business: { label: "Business", color: "bg-primary/10 text-primary border-primary/30",          desc: "Dataset premium + richieste custom" },
  premium:  { label: "Premium",  color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", desc: "Enterprise — tutto illimitato" },
};

const methodLabel: Record<string, string> = {
  tokens: "Token",
  payment: "Abbonamento",
  free: "Gratuito",
  ads: "Pubblicità",
};

type Tab = "dataset" | "profilo" | "piano" | "admin";

export default function Dashboard() {
  const { client, logout } = useBusinessAuth();
  const [, navigate] = useLocation();
  const [unlocked, setUnlocked] = useState<UnlockedDataset[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [tab, setTab] = useState<Tab>("dataset");

  const plan = typeof window !== "undefined"
    ? (localStorage.getItem("pb_client_plan") ?? "free")
    : "free";
  const isAdmin = typeof window !== "undefined"
    ? localStorage.getItem("pb_is_admin") === "true"
    : false;

  useEffect(() => {
    if (!client) { navigate("/login"); return; }
    if (client.id === 0) return; // admin bypass — skip fetch
    fetch(`${API_BASE}/api/clients/${client.id}/datasets`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("pb_session_token") ?? ""}` },
    })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setUnlocked(Array.isArray(data) ? data : []))
      .catch(() => setUnlocked([]))
      .finally(() => setLoadingDatasets(false));
  }, [client]);

  if (!client) return null;

  const tokenBalance = client.tokenBalance ?? 0;
  const totalAdsWatched = client.totalAdsWatched ?? 0;
  const planInfo = PLAN_LABELS[plan] ?? PLAN_LABELS.free;
  const initials = client.name
    .split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  const handleLogout = () => { logout(); navigate("/"); };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      <section className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">

          {/* Header */}
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-white text-xl font-black select-none">
                {initials || <User className="h-6 w-6" />}
              </div>
              <div>
                <h1 className="text-2xl font-black">
                  Ciao, {client.name.split(" ")[0]} 👋
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {client.email}
                  {client.company ? ` · ${client.company}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Badge variant="outline" className="border-destructive/40 text-destructive text-xs">
                  Admin
                </Badge>
              )}
              <Badge variant="outline" className={`text-xs border ${planInfo.color}`}>
                Piano {planInfo.label}
              </Badge>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={handleLogout}>
                <LogOut className="h-4 w-4" /> Esci
              </Button>
            </div>
          </div>

          {/* Stats rapide */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              { label: "Dataset sbloccati", value: unlocked.length, icon: Database },
              { label: "Token disponibili", value: tokenBalance, icon: Zap },
              { label: "Ads guardati", value: totalAdsWatched, icon: BarChart3 },
              { label: "Qualità media", value: "99%", icon: ShieldCheck },
            ].map((s) => (
              <Card key={s.label} className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <s.icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tab Nav */}
          <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
            {(["dataset", "profilo", "piano", ...(isAdmin ? ["admin"] : [])] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap capitalize transition-colors border-b-2 -mb-px
                  ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {t === "dataset" ? "I miei Dataset" : t === "profilo" ? "Profilo" : t === "piano" ? "Piano & Accesso" : "⚙️ Admin"}
              </button>
            ))}
          </div>

          {/* Tab: Dataset */}
          {tab === "dataset" && (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Card className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <h2 className="font-semibold">Dataset sbloccati</h2>
                    <p className="text-xs text-muted-foreground">Scarica in CSV o JSON</p>
                  </CardHeader>
                  <CardContent>
                    {loadingDatasets ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                      </div>
                    ) : unlocked.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Lock className="h-8 w-8 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">Nessun dataset sbloccato</p>
                        <p className="text-xs mt-1 mb-4">Guarda un annuncio o passa a un piano superiore per accedere ai dataset.</p>
                        <Link href="/catalog">
                          <Button size="sm" className="gap-2">
                            Sfoglia il catalogo <ArrowUpRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {unlocked.map((entry) => (
                          <div key={entry.id}
                            className="flex items-center justify-between rounded-lg border border-border bg-background p-3 hover:border-primary/30 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-muted">
                                <Database className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div>
                                <p className="text-sm font-medium leading-none">
                                  {entry.dataset?.name ?? `Dataset #${entry.datasetId}`}
                                </p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(entry.grantedAt).toLocaleDateString("it-IT")}
                                  </span>
                                  <Badge variant="secondary" className="text-[10px] h-4">
                                    {methodLabel[entry.method] ?? entry.method}
                                  </Badge>
                                  {entry.dataset?.recordCount != null && (
                                    <span className="text-xs text-muted-foreground hidden sm:inline">
                                      {entry.dataset.recordCount.toLocaleString("it-IT")} record
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 px-2"
                                onClick={() => window.open(`${API_BASE}/api/datasets/${entry.datasetId}/export?format=csv`, "_blank")}>
                                <Download className="h-3 w-3" /> CSV
                              </Button>
                              <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 px-2"
                                onClick={() => window.open(`${API_BASE}/api/datasets/${entry.datasetId}/export?format=json`, "_blank")}>
                                <Download className="h-3 w-3" /> JSON
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {unlocked.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-border text-center">
                        <Link href="/catalog">
                          <Button variant="outline" size="sm" className="gap-2">
                            Scopri altri dataset <ArrowUpRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <Card className="border-border bg-card">
                  <CardContent className="p-5">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" /> Token disponibili
                    </h3>
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Saldo attuale</span>
                        <span className="text-2xl font-black text-primary">{tokenBalance}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 mb-4">
                        Ogni ad = 2 token · Sblocco dataset BASIC = 3 token
                      </p>
                      <Link href="/catalog">
                        <Button size="sm" className="w-full gap-2">
                          <Zap className="h-3.5 w-3.5" /> Sblocca dataset
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardContent className="p-5">
                    <h3 className="font-semibold mb-3">Attività</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Dataset acceduti</span>
                          <span className="font-medium">{unlocked.length}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, (unlocked.length / 10) * 100)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Ads guardati</span>
                          <span className="font-medium">{totalAdsWatched}/30</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-secondary rounded-full transition-all"
                            style={{ width: `${Math.min(100, (totalAdsWatched / 30) * 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Tab: Profilo */}
          {tab === "profilo" && (
            <div className="max-w-lg">
              <Card className="border-border bg-card">
                <CardHeader>
                  <h2 className="font-semibold">Informazioni account</h2>
                  <p className="text-xs text-muted-foreground">I tuoi dati personali su PUTITUP Business</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-background">
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-white text-2xl font-black select-none flex-shrink-0">
                      {initials || <User className="h-7 w-7" />}
                    </div>
                    <div>
                      <p className="text-lg font-bold">{client.name}</p>
                      <p className="text-sm text-muted-foreground">{client.email}</p>
                      {client.company && (
                        <p className="text-xs text-muted-foreground mt-0.5">{client.company}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="text-sm font-medium">{client.email}</p>
                      </div>
                      <Badge variant="outline" className="ml-auto text-xs border-green-500/40 text-green-400">
                        Verificata
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Nome completo</p>
                        <p className="text-sm font-medium">{client.name}</p>
                      </div>
                    </div>

                    {client.company && (
                      <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                        <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Azienda</p>
                          <p className="text-sm font-medium">{client.company}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <ShieldCheck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Autenticazione</p>
                        <p className="text-sm font-medium">OTP via email — nessuna password</p>
                      </div>
                    </div>
                  </div>

                  <Button variant="destructive" size="sm" className="w-full gap-2 mt-2" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" /> Disconnetti account
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tab: Piano */}
          {tab === "piano" && (
            <div className="max-w-lg">
              <Card className="border-border bg-card">
                <CardHeader>
                  <h2 className="font-semibold">Il tuo piano</h2>
                  <p className="text-xs text-muted-foreground">Accesso e limiti del tuo account</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current plan */}
                  <div className={`rounded-xl border p-5 ${planInfo.color}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-black">Piano {planInfo.label}</span>
                      <Badge className={`text-xs ${planInfo.color} border`}>Attivo</Badge>
                    </div>
                    <p className="text-sm opacity-80">{planInfo.desc}</p>
                  </div>

                  {/* Feature list */}
                  <div className="space-y-2">
                    {[
                      { feature: "Dataset BASIC", ok: true },
                      { feature: "Dataset MEDIUM", ok: plan === "business" || plan === "premium" },
                      { feature: "Dataset PREMIUM", ok: plan === "premium" },
                      { feature: "Richieste dataset custom", ok: plan === "business" || plan === "premium" },
                      { feature: "Senza pubblicità", ok: plan !== "free" },
                      { feature: "Supporto prioritario", ok: plan === "premium" },
                    ].map(({ feature, ok }) => (
                      <div key={feature} className="flex items-center gap-3 rounded-lg border border-border p-3">
                        <span className={`text-base ${ok ? "text-green-400" : "text-muted-foreground opacity-30"}`}>
                          {ok ? "✓" : "✕"}
                        </span>
                        <span className={`text-sm ${ok ? "text-foreground" : "text-muted-foreground"}`}>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {plan !== "premium" && (
                    <Link href="/pricing">
                      <Button className="w-full gap-2 mt-2">
                        <ArrowUpRight className="h-4 w-4" />
                        Passa a un piano superiore
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tab: Admin */}
          {tab === "admin" && isAdmin && (
            <AdminPanel apiBase={API_BASE} />
          )}

        </div>
      </section>
      <Footer />
    </div>
  );
}
