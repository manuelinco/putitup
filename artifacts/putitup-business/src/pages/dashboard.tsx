import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import { useBusinessAuth } from "@/hooks/useBusinessAuth";
import {
  ArrowUpRight,
  BarChart3,
  Clock,
  Database,
  Download,
  Lock,
  ShieldCheck,
  Zap,
} from "lucide-react";

const recentDownloads = [
  {
    name: "Multilingual Sentiment — v3",
    date: "2025-04-22",
    size: "48 MB",
    format: "CSV",
    tier: "BASIC",
  },
  {
    name: "Customer Intent Classification",
    date: "2025-04-18",
    size: "32 MB",
    format: "JSONL",
    tier: "BASIC",
  },
];

const stats = [
  { label: "Datasets Accessed", value: "2", icon: Database },
  { label: "Total Downloaded", value: "80 MB", icon: Download },
  { label: "Plan", value: "Starter", icon: Zap },
  { label: "Quality Score", value: "98.7%", icon: ShieldCheck },
];

export default function Dashboard() {
  const { client } = useBusinessAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!client) navigate("/login");
  }, [client]);

  if (!client) return null;

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
                  <h2 className="font-semibold">Recent Downloads</h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentDownloads.map((d) => (
                      <div
                        key={d.name}
                        className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                            <Database className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{d.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-xs text-muted-foreground">{d.date}</p>
                              <Badge variant="secondary" className="text-[10px]">{d.format}</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{d.size}</span>
                          <Button size="sm" variant="ghost" className="gap-1 text-xs">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
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
                  <h3 className="mb-3 font-semibold">Current Plan</h3>
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge>Starter</Badge>
                      <span className="text-sm font-bold">€9.99/mo</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      Access BASIC datasets via ad challenges (3 ads per download).
                    </p>
                    <Link href="/pricing">
                      <Button size="sm" className="w-full gap-2">
                        <Zap className="h-3.5 w-3.5" />
                        Upgrade to Business
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
                        <span>2 / 3</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full w-2/3 rounded-full bg-primary" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Storage used</span>
                        <span>80 MB / 500 MB</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: "16%" }} />
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
