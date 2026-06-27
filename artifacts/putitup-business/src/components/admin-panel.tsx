import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, BarChart3, Database, Play, RefreshCw,
  ShieldCheck, Users, Zap,
} from "lucide-react";

interface AgentStatus {
  running: boolean;
  groqEnabled: boolean;
  lastRun: {
    runId: string;
    startedAt: string;
    finishedAt: string;
    status: string;
    datasetsProcessed: number;
    tasksCreated: number;
    errors: string[];
  } | null;
}

interface PlatformStats {
  totalUsers: number;
  totalTasks: number;
  totalResponses: number;
  totalDatasets: number;
  pendingPayments: number;
  totalPaidTon: number;
}

interface Dataset {
  id: number;
  name: string;
  category: string;
  status: string;
  recordCount: number | null;
  requestedTaskCount: number;
}

export function AdminPanel({ apiBase }: { apiBase: string }) {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState(false);
  const [agentMsg, setAgentMsg] = useState<string | null>(null);

  const headers = {
    Authorization: `Basic ${btoa(`${localStorage.getItem("pb_admin_token") ?? ""}:`)}`,
    "Content-Type": "application/json",
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`${apiBase}/api/admin/stats`, { headers }).then((r) => r.ok ? r.json() : null),
      fetch(`${apiBase}/api/agent/status`).then((r) => r.ok ? r.json() : null),
      fetch(`${apiBase}/api/datasets`).then((r) => r.ok ? r.json() : []),
    ]).then(([s, a, d]) => {
      if (s) setStats(s);
      if (a) setAgentStatus(a);
      if (Array.isArray(d)) setDatasets(d);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRunAgent = async (dryRun = false) => {
    setRunningAgent(true);
    setAgentMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasksPerDataset: 20, dryRun }),
      });
      const data = await res.json();
      setAgentMsg(dryRun ? `Dry run OK — avrebbe creato task su ${data.datasetIds} dataset` : "Agent avviato in background");
      setTimeout(() => { load(); setAgentMsg(null); }, 5000);
    } catch {
      setAgentMsg("Errore di connessione");
    } finally {
      setRunningAgent(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Platform Admin</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Pannello di controllo riservato agli amministratori</p>
        </div>
        <Button size="sm" variant="outline" className="gap-2" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" /> Aggiorna
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats && [
          { label: "Utenti totali", value: stats.totalUsers.toLocaleString("it-IT"), icon: Users },
          { label: "Task generati", value: stats.totalTasks.toLocaleString("it-IT"), icon: Database },
          { label: "Risposte", value: stats.totalResponses.toLocaleString("it-IT"), icon: Activity },
          { label: "Dataset attivi", value: stats.totalDatasets.toString(), icon: BarChart3 },
          { label: "Pagamenti pending", value: stats.pendingPayments.toString(), icon: Zap },
          { label: "TON pagati", value: `${stats.totalPaidTon.toFixed(4)} TON`, icon: ShieldCheck },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-border bg-card">
            <CardContent className="p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-xl font-black">{value}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Agent control */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" /> Task Agent
          </h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${agentStatus?.running ? "bg-green-400 animate-pulse" : "bg-muted"}`} />
                <span className="text-sm font-medium">
                  {agentStatus?.running ? "In esecuzione" : "In attesa"}
                </span>
              </div>
              <Badge variant="outline" className={`text-[10px] ${agentStatus?.groqEnabled ? "border-green-500/40 text-green-400" : "border-muted text-muted-foreground"}`}>
                GROQ {agentStatus?.groqEnabled ? "ON" : "OFF"}
              </Badge>
            </div>
            {agentStatus?.lastRun && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Ultimo run: {new Date(agentStatus.lastRun.startedAt).toLocaleString("it-IT")}</p>
                <p>Dataset processati: <span className="text-foreground font-medium">{agentStatus.lastRun.datasetsProcessed}</span></p>
                <p>Task creati: <span className="text-foreground font-medium">{agentStatus.lastRun.tasksCreated}</span></p>
                {agentStatus.lastRun.errors.length > 0 && (
                  <p className="text-destructive">{agentStatus.lastRun.errors.length} errori</p>
                )}
              </div>
            )}
          </div>

          {agentMsg && (
            <p className="text-xs text-primary bg-primary/5 rounded-lg px-3 py-2">{agentMsg}</p>
          )}

          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-2 flex-1" disabled={runningAgent}
              onClick={() => handleRunAgent(true)}>
              <Play className="h-3.5 w-3.5" /> Dry Run
            </Button>
            <Button size="sm" className="gap-2 flex-1" disabled={runningAgent || agentStatus?.running}
              onClick={() => handleRunAgent(false)}>
              {runningAgent ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run Agent
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dataset list */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <h3 className="font-semibold">Dataset ({datasets.length})</h3>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {datasets.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium leading-none">{d.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    #{d.id} · {d.category} · {(d.requestedTaskCount ?? 0).toLocaleString("it-IT")} task target
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${d.status === "active" ? "border-green-500/40 text-green-400" : "border-muted text-muted-foreground"}`}
                >
                  {d.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
