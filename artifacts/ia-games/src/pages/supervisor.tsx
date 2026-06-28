import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, Eye, Shield, Loader2, RefreshCw, Inbox, Plus, X, RotateCcw, Flag, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

async function apiFetch(path: string, options?: RequestInit) {
  const token = getSessionToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
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
  finalLabel: string | null;
  needsRelabeling: boolean;
  createdAt: string;
  supervisorApprovedAt: string | null;
}

interface ReportItem {
  id: number;
  taskId: number;
  datasetId: number | null;
  reporterUserId: number | null;
  reason: string;
  note: string | null;
  questionSnapshot: string | null;
  status: string;
  createdAt: string;
}

type Tab = "controller" | "admin" | "basket" | "reports";

export default function Controller() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [tasks, setTasks] = useState<TaskReview[]>([]);
  const [adminTasks, setAdminTasks] = useState<TaskReview[]>([]);
  const [basketTasks, setBasketTasks] = useState<TaskReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<number | null>(null);
  const [adminApproving, setAdminApproving] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("controller");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [resolvingReport, setResolvingReport] = useState<number | null>(null);

  // Basket state
  const [relabelInputs, setRelabelInputs] = useState<Record<number, string>>({});
  const [relabelTags, setRelabelTags] = useState<Record<number, string[]>>({});
  const [relabeling, setRelabeling] = useState<number | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const [sv, ad, bk] = await Promise.all([
        apiFetch("/api/tasks/review?stage=controller_review"),
        apiFetch("/api/tasks/review?stage=admin_review"),
        apiFetch("/api/tasks/relabel-basket"),
      ]);
      setTasks(sv ?? []);
      setAdminTasks(ad ?? []);
      setBasketTasks(bk ?? []);
      if (user?.id) {
        const rp = await apiFetch(
          `/api/tasks/reports?status=pending&userId=${user.id}`,
        ).catch(() => null);
        const list = Array.isArray(rp) ? rp : (rp?.reports ?? []);
        setReports(list);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  if (!user) {
    navigate("/");
    return null;
  }

  if (!user.isAdmin && !user.isSupervisor) {
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

  const handleResolveReport = async (reportId: number, status: "approved" | "rejected") => {
    if (!user) return;
    setResolvingReport(reportId);
    try {
      await apiFetch(`/api/tasks/reports/${reportId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, userId: user.id }),
      });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setResolvingReport(null);
    }
  };

  // Basket helpers
  const addTag = (taskId: number) => {
    const input = (relabelInputs[taskId] ?? "").trim();
    if (!input) return;
    setRelabelTags((prev) => ({
      ...prev,
      [taskId]: [...(prev[taskId] ?? []), input],
    }));
    setRelabelInputs((prev) => ({ ...prev, [taskId]: "" }));
  };

  const removeTag = (taskId: number, idx: number) => {
    setRelabelTags((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] ?? []).filter((_, i) => i !== idx),
    }));
  };

  const handleRelabel = async (taskId: number) => {
    const tags = relabelTags[taskId] ?? [];
    if (tags.length < 2) {
      alert("Add at least 2 new labels before submitting.");
      return;
    }
    setRelabeling(taskId);
    try {
      await apiFetch(`/api/tasks/${taskId}/relabel`, {
        method: "POST",
        body: JSON.stringify({ newOptions: tags }),
      });
      setRelabelTags((prev) => ({ ...prev, [taskId]: [] }));
      await loadTasks();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setRelabeling(null);
    }
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "controller", label: "Controller", count: tasks.length },
    { key: "admin", label: "Admin", count: adminTasks.length },
    { key: "basket", label: "Basket", count: basketTasks.length },
    { key: "reports", label: "Segnalazioni", count: reports.length },
  ];

  const displayTasks = tab === "controller" ? tasks : tab === "admin" ? adminTasks : basketTasks;
  const stageLabel =
    tab === "controller" ? "Controller Review" :
    tab === "admin" ? "Admin Review" :
    "Relabeling Basket";

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
            <p className="text-[11px] text-muted-foreground">Approve tasks · relabel edge cases</p>
          </div>
          <Button variant="ghost" size="sm" onClick={loadTasks} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-4 gap-2">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "p-2.5 rounded-xl text-xs font-bold border transition-all",
                tab === key
                  ? key === "basket"
                    ? "border-yellow-400/60 bg-yellow-400/15 text-yellow-400"
                    : "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/40 bg-card/40 text-muted-foreground hover:border-border"
              )}
            >
              {key === "basket" && <Inbox className="w-3 h-3 inline mr-1" />}
              {key === "reports" && <Flag className="w-3 h-3 inline mr-1" />}
              {label}
              <span className={cn(
                "ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-black",
                tab === key
                  ? key === "basket" ? "bg-yellow-400/30" : "bg-primary/30"
                  : "bg-muted/60"
              )}>
                {count}
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
        ) : tab === "reports" ? (
          // ── Reported tasks basket ──────────────────────────────────────
          reports.length === 0 ? (
            <Card className="border-border/40 text-center">
              <CardContent className="p-8 space-y-2">
                <Flag className="w-10 h-10 text-secondary mx-auto" />
                <p className="font-black">Nessuna segnalazione</p>
                <p className="text-xs text-muted-foreground">
                  Le domande segnalate come errate dagli operatori appariranno qui.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground px-1">
                Domande segnalate come errate dagli operatori. Conferma per chiudere la segnalazione, oppure ignorala.
              </p>
              {reports.map((rep) => {
                const isResolving = resolvingReport === rep.id;
                return (
                  <Card key={rep.id} className="border-destructive/30 bg-destructive/5">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px] uppercase border-destructive/40 text-destructive">
                            {rep.reason === "wrong_question" ? "Domanda errata" : rep.reason}
                          </Badge>
                          {rep.datasetId != null && (
                            <Badge variant="outline" className="text-[9px] text-accent border-accent/40">
                              DS #{rep.datasetId}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[9px] text-muted-foreground border-border/40">
                            Task #{rep.taskId}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">#{rep.id}</span>
                      </div>

                      <p className="text-sm font-bold leading-snug">
                        {rep.questionSnapshot ?? "(nessun testo della domanda salvato)"}
                      </p>
                      {rep.note && (
                        <p className="text-[11px] text-muted-foreground italic">Nota: {rep.note}</p>
                      )}

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          className="h-10 font-bold text-sm bg-secondary hover:bg-secondary/90"
                          onClick={() => handleResolveReport(rep.id, "approved")}
                          disabled={isResolving}
                        >
                          {isResolving ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> ...</>
                          ) : (
                            <><CheckCircle className="w-4 h-4 mr-2" /> Conferma</>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 font-bold text-sm border-border/50"
                          onClick={() => handleResolveReport(rep.id, "rejected")}
                          disabled={isResolving}
                        >
                          <Ban className="w-4 h-4 mr-2" /> Ignora
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
        ) : displayTasks.length === 0 ? (
          <Card className="border-border/40 text-center">
            <CardContent className="p-8 space-y-2">
              {tab === "basket" ? (
                <Inbox className="w-10 h-10 text-yellow-400 mx-auto" />
              ) : (
                <CheckCircle className="w-10 h-10 text-secondary mx-auto" />
              )}
              <p className="font-black">
                {tab === "basket" ? "Basket is empty" : "No tasks pending"}
              </p>
              <p className="text-xs text-muted-foreground">
                {tab === "basket"
                  ? "Tasks where 'Other' won consensus will appear here."
                  : `${stageLabel}: queue is empty.`}
              </p>
            </CardContent>
          </Card>
        ) : tab === "basket" ? (
          // ── Relabeling Basket ──────────────────────────────────────────
          <div className="space-y-4">
            <p className="text-[11px] text-yellow-400/80 font-semibold px-1">
              These tasks reached consensus on "Other". Add specific labels so labelers can classify them properly.
            </p>
            {basketTasks.map((task) => {
              const payload = task.dataPayload ?? {};
              const question = (payload.question as string | undefined) ?? "—";
              const imageUrl = payload.imageUrl as string | undefined;
              const audioUrl = payload.audioUrl as string | undefined;
              const tags = relabelTags[task.id] ?? [];
              const inputVal = relabelInputs[task.id] ?? "";
              const isRelabeling = relabeling === task.id;

              return (
                <Card key={task.id} className="border-yellow-400/30 bg-yellow-400/5">
                  <CardContent className="p-4 space-y-3">
                    {/* Meta */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] uppercase border-yellow-400/40 text-yellow-400">
                          {task.type}
                        </Badge>
                        {task.datasetId && (
                          <Badge variant="outline" className="text-[9px] text-accent border-accent/40">
                            DS #{task.datasetId}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[9px] border-destructive/40 text-destructive">
                          Other won
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">#{task.id}</span>
                    </div>

                    {/* Content preview */}
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt="Task image"
                        className="w-full h-40 object-cover rounded-lg border border-border/30"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    {audioUrl && (
                      <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
                        <p className="text-[10px] text-muted-foreground font-mono truncate">{audioUrl}</p>
                      </div>
                    )}

                    {/* Question */}
                    <p className="text-sm font-bold leading-snug">{question}</p>

                    {/* Consensus info */}
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-muted-foreground">Consensus answer:</span>
                      <span className="font-black text-yellow-400">{task.finalLabel ?? "Other"}</span>
                      <span className="text-muted-foreground ml-auto">{task.consensusCount} votes</span>
                    </div>

                    {/* New label input */}
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] font-bold text-foreground/80">Add specific labels for this task:</p>

                      {/* Tags */}
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/20 border border-primary/40 text-xs font-semibold text-primary"
                            >
                              {tag}
                              <button onClick={() => removeTag(task.id, idx)} className="hover:text-destructive">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Input + Add */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={inputVal}
                          onChange={(e) => setRelabelInputs((prev) => ({ ...prev, [task.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(task.id); } }}
                          placeholder="e.g. Cave, Mountain, Forest..."
                          className="flex-1 px-3 py-2 rounded-lg bg-muted/30 border border-border/50 text-xs outline-none focus:border-primary/60 placeholder:text-muted-foreground/50"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addTag(task.id)}
                          disabled={!inputVal.trim()}
                          className="border-primary/40 text-primary h-9 px-3"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      <p className="text-[10px] text-muted-foreground">
                        Press Enter or + to add each label. Minimum 2 labels required.
                      </p>

                      {/* Submit */}
                      <Button
                        className="w-full h-10 font-bold text-sm bg-yellow-400 hover:bg-yellow-300 text-black"
                        onClick={() => handleRelabel(task.id)}
                        disabled={isRelabeling || tags.length < 2}
                      >
                        {isRelabeling ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Re-injecting...</>
                        ) : (
                          <><RotateCcw className="w-4 h-4 mr-2" /> Re-inject into labeling queue</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          // ── Normal review queue ────────────────────────────────────────
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
