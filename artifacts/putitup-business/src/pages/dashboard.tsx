import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import { useBusinessAuth } from "@/hooks/useBusinessAuth";
import {
  ArrowUpRight,
  BarChart3,
  Database,
  Download,
  Lock,
  ShieldCheck,
  Zap,
} from "lucide-react";

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

const methodLabel: Record<string, string> = {
  tokens: "Tokens",
  payment: "Subscription",
  free: "Free",
  ads: "Ad Unlock",
};

export default function Dashboard() {
  const { client } = useBusinessAuth();
  const [, navigate] = useLocation();
  const [unlocked, setUnlocked] = useState<UnlockedDataset[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  useEffect(() => {
    if (!client) { navigate("/login"); return; }
    fetch(`/api/clients/${client.id}/datasets`)
      .then((r) => r.json())
      .then((data) => setUnlocked(Array.isArray(data) ? data : []))
      .catch(() => setUnlocked([]))
      .finally(() => setLoadingDatasets(false));
  }, [client]);

  if (!client) return null;

  const tokenBalance = client.tokenBalance ?? 0;
  const totalAdsWatched = client.totalAdsWatched ?? 0;

  const stats = [
    { label: "Datasets Accessed", value: unlocked.length.toString(), icon: Database },
    { label: "Token Balance", value: tokenBalance.toString(), icon: Zap },
    { label: "Ads Watched", value: totalAdsWatched.toString(), icon: BarChart3 },
    { label: "Quality Score", value: "99%", icon: ShieldCheck },
  ];

  const handleDownload = (datasetId: number, datasetName: string) => {
    const safeName = datasetName.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
    window.open(`/api/datasets/${datasetId}/export?format=csv`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <section className="px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Welcome, {client.name.split(" ")[0]}</h1>
              <p className="mt-1 text-muted-foreground text-sm">
                {client.company ? `${client.company} · ` : ""}{client.email}
              </p>
            </div>
            <Badge variant="outline" className="gap-1.5 text-secondary border-secondary/40">
              <ShieldCheck className="h-3 w-3" />
              Verified Account
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {stats.map((s) => (
              <Card key={s.label} className="border-border bg-card">
                <CardContent className="p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <s.icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <h2 className="font-semibold">Unlocked Datasets</h2>
                </CardHeader>
                <CardContent>
                  {loadingDatasets ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                    </div>
                  ) : unlocked.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Lock className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No datasets unlocked yet.</p>
                      <Link href="/catalog">
                        <Button variant="outline" size="sm" className="mt-3 gap-2">
                          Browse Catalog <ArrowUpRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {unlocked.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                              <Database className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {entry.dataset?.name ?? `Dataset #${entry.datasetId}`}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-xs text-muted-foreground">
                                  {new Date(entry.grantedAt).toLocaleDateString("en-US")}
                                </p>
                                <Badge variant="secondary" className="text-[10px]">
                                  {methodLabel[entry.method] ?? entry.method}
                                </Badge>
                                {entry.dataset?.qualityScore != null && (
                                  <Badge variant="outline" className="text-[10px] text-secondary border-secondary/40">
                                    {entry.dataset.qualityScore > 0 ? `${entry.dataset.qualityScore.toFixed(1)}% quality` : "In revisione"}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {entry.dataset?.recordCount != null && (
                              <span className="text-xs text-muted-foreground hidden sm:block">
                                {entry.dataset.recordCount.toLocaleString()} records
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-xs"
                              onClick={() => handleDownload(entry.datasetId, entry.dataset?.name ?? `dataset_${entry.datasetId}`)}
                            >
                              <Download className="h-3.5 w-3.5" />
                              CSV
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-xs"
                              onClick={() => window.open(`/api/datasets/${entry.datasetId}/export?format=json`, "_blank")}
                            >
                              <Download className="h-3.5 w-3.5" />
                              JSON
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 text-center">
                    <Link href="/catalog">
                      <Button variant="outline" size="sm" className="gap-2">
                        Browse More Datasets <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="border-border bg-card">
                <CardContent className="p-5">
                  <h3 className="mb-3 font-semibold">Token Balance</h3>
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge>Tokens</Badge>
                      <span className="text-2xl font-bold text-primary">{tokenBalance}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      Each ad watched earns 2 tokens. Use tokens to unlock BASIC datasets (3 tokens each).
                    </p>
                    <Link href="/catalog">
                      <Button size="sm" className="w-full gap-2">
                        <Zap className="h-3.5 w-3.5" />
                        Browse & Unlock Datasets
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-5">
                  <h3 className="mb-3 font-semibold">Usage This Month</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Datasets accessed</span>
                        <span>{unlocked.length} total</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, (unlocked.length / 10) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Ads watched today</span>
                        <span>{totalAdsWatched}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-secondary rounded-full"
                          style={{ width: `${Math.min(100, (totalAdsWatched / 30) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
