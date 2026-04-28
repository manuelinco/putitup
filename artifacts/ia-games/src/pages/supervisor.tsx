import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, Eye, Shield, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `API error ${res.status}`);
  return data;
}

interface TaskReview {
  id: number;
  type: string;
  difficulty: string;
  reviewStage: string;
  consensusCount: number;
  requiredVotes: number;
  datasetId: number | null;
  dataPayload: Record<string, unknown>;
  createdAt: string;
  supervisorApprovedAt: string | null;
}

export default function Controller() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [tasks, setTasks] = useState<TaskReview[]>([]);
  const [adminTasks, setAdminTasks] = useState<TaskReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<number | null>(null);
  const [adminApproving, setAdminApproving] = useState<number | null>(null);
  const [tab, setTab] = useState<"controller" | "admin">("controller");

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const [sv, ad] = await Promise.all([
        apiFetch("/api/tasks/review?stage=supervisor_review"),
        apiFetch("/api/tasks/review?stage=admin_review"),
      ]);
      setTasks(sv ?? []);
      setAdminTasks(ad ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  if (!user) {
    navigate("/");
    return null;
  }

  if (!user.isAdmin) {
    return (
      <Layout>
        <div className="p-4 flex items-center justify-center min-h-[60vh]">
          <Card className="border-destructive/40 bg-destructive/5 w-full max-w-sm">
            <CardContent className="p-6 text-center space-y-3">
              <Shield className="w-12 h-12 text-destructive mx-auto" />
              <p className="font-black">Access Denied</p>
              <p className="text-xs text-muted-foreground">Only controllers and admins can access this section.</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/")}>Back to Home</Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const handleControllerApprove = async (taskId: number) => {
    if (!user) return;
    setApproving(taskId);
    try {
      await apiFetch(`/api/tasks/${taskId}/supervisor-approve`, {
        method: "PATCH",
        body: JSON.stringify({ supervisorId: user.id }),
      });
      await loadTasks();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setApproving(null);
    }
  };

  const handleAdminApprove = async (taskId: number) => {
    if (!user) return;
    setAdminApproving(taskId);
    try {
      await apiFetch(`/api/tasks/${taskId}/admin-approve`, {
        method: "PATCH",
        body: JSON.stringify({ adminId: user.id }),
      });
      await loadTasks();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAdminApproving(null);
    }
  };

  const displayTasks = tab === "controller" ? tasks : adminTasks;
  const stageLabel = tab === "controller" ? "Controller Review" : "Admin Review";

  return (
    <Layout>
      <div className="p-4 space-y-4 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Review Queue
            </h1>
            <p className="text-[11px] text-muted-foreground">Approve tasks that reached consensus</p>
          </div>
          <Button variant="ghost" size="sm" onClick={loadTasks} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 gap-2">
          {(["controller", "admin"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "p-2.5 rounded-xl text-xs font-bold border transition-all",
                tab === t
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/40 bg-card/40 text-muted-foreground hover:border-border"
              )}
            >
              {t === "controller" ? "Controller" : "Admin"}
              <span className={cn(
                "ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black",
                tab === t ? "bg-primary/30" : "bg-muted/60"
              )}>
                {t === "controller" ? tasks.length : adminTasks.length}
              </span>
            </button>
          ))}
        </div>

        {/* Task list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : displayTasks.length === 0 ? (
          <Card className="border-border/40 text-center">
            <CardContent className="p-8 space-y-2">
              <CheckCircle className="w-10 h-10 text-secondary mx-auto" />
              <p className="font-black">No tasks pending</p>
              <p className="text-xs text-muted-foreground">
                {stageLabel}: queue is empty.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {displayTasks.map((task) => {
              const payload = task.dataPayload ?? {};
              const options = (payload.options as string[] | undefined) ?? [];
              const question = (payload.question as string | undefined) ?? "—";
              const isApprovingSv = approving === task.id;
              const isApprovingAd = adminApproving === task.id;

              return (
                <Card key={task.id} className="border-border/50">
                  <CardContent className="p-4 space-y-3">
                    {/* Meta */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] uppercase">
                          {task.type}
                        </Badge>
                        <Badge variant="outline" className={cn(
                          "text-[9px] uppercase",
                          task.difficulty === "easy" ? "text-secondary border-secondary/40"
                          : task.difficulty === "hard" ? "text-destructive border-destructive/40"
                          : "text-yellow-400 border-yellow-400/40"
                        )}>
                          {task.difficulty}
                        </Badge>
                        {task.datasetId && (
                          <Badge variant="outline" className="text-[9px] text-accent border-accent/40">
                            DS #{task.datasetId}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">#{task.id}</span>
                    </div>

                    {/* Question */}
                    <p className="text-sm font-bold leading-snug">{question}</p>

                    {/* Options */}
                    {options.length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {options.map((opt) => (
                          <div key={opt} className="px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border/30 text-xs font-semibold truncate">
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Consensus progress */}
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Votes received:</span>
                      <span className="font-black text-primary">{task.consensusCount ?? 0} / {task.requiredVotes ?? 3}</span>
                    </div>
                    <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(((task.consensusCount ?? 0) / (task.requiredVotes ?? 3)) * 100, 100)}%` }}
                      />
                    </div>

                    {/* Action */}
                    {tab === "controller" ? (
                      <Button
                        className="w-full h-10 font-bold text-sm"
                        onClick={() => handleControllerApprove(task.id)}
                        disabled={isApprovingSv}
                      >
                        {isApprovingSv ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Approving...</>
                        ) : (
                          <><CheckCircle className="w-4 h-4 mr-2" /> Approve → Admin Review</>
                        )}
                      </Button>
                    ) : (
                      <Button
                        className="w-full h-10 font-bold text-sm bg-secondary hover:bg-secondary/90"
                        onClick={() => handleAdminApprove(task.id)}
                        disabled={isApprovingAd}
                      >
                        {isApprovingAd ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Approving...</>
                        ) : (
                          <><CheckCircle className="w-4 h-4 mr-2" /> Approve & Publish + Rewards</>
                        )}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
