import { useState, useEffect } from "react";
import {
  useGetAnalyticsSummary,
  useListUsers,
  useCreateDataset,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Settings,
  Users,
  Database,
  Target,
  TrendingUp,
  Plus,
  Trash2,
  CheckCircle,
  Eye,
  Wallet,
  Coins,
  BarChart2,
  ClipboardList,
  Download,
  ShieldAlert,
  Ban,
  ShieldCheck,
  Search,
  UserCog,
  Send,
  AlertCircle,
} from "lucide-react";
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

type TaskEntry = {
  type: "text" | "image" | "classification";
  question: string;
  content: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  correctAnswer: string;
  difficulty: "easy" | "medium" | "hard";
};

const emptyTask = (): TaskEntry => ({
  type: "text",
  question: "",
  content: "",
  option1: "",
  option2: "",
  option3: "",
  option4: "",
  correctAnswer: "",
  difficulty: "easy",
});

interface AdminStats {
  totalUsers: number;
  totalTasks: number;
  totalResponses: number;
  totalDatasets: number;
  pendingPayments: number;
  totalPaidTon: number;
}

interface PendingPayment {
  payment: {
    id: number;
    userId: number;
    walletAddress: string;
    amountTon: number;
    reason: string;
    isPaid: boolean;
    createdAt: string;
  };
  user: {
    id: number;
    username: string;
    walletAddress: string;
  } | null;
}

type ActiveSection = "stats" | "tasks" | "datasets" | "payments" | "users" | "approve" | "minipimer" | "botwatch";

interface BotWatchRow {
  userId: number;
  username: string;
  telegramId: string | null;
  riskScore: number;
  suspiciousCount: number;
  cooldownUntil: string | null;
  lastViewTime: string | null;
  adsWatchedToday: number;
  totalAdsWatched: number;
  blocked: boolean;
}

interface RoleUser {
  id: number;
  username: string;
  telegramId: string | null;
  points: number;
  level: string;
  isAdmin: boolean;
  isSupervisor: boolean;
  isModerator: boolean;
}

interface AntibotConfig {
  config: {
    dailyAdCap: number;
    adCooldownSeconds: number;
    minAdSeconds: number;
    riskBlockThreshold: number;
    flagThreshold: number;
  };
  stats: { tracked: number; blocked: number; flagged: number };
}

export default function Admin() {
  const { data: analytics } = useGetAnalyticsSummary();
  const { data: users } = useListUsers({ limit: 20 });
  const createDataset = useCreateDataset();

  const [activeSection, setActiveSection] = useState<ActiveSection>("stats");
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<number | null>(null);
  const [txHashInput, setTxHashInput] = useState<Record<number, string>>({});
  const [approvalResult, setApprovalResult] = useState<string | null>(null);
  const [allDatasets, setAllDatasets] = useState<{id: number; name: string; status: string; recordCount: number | null}[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);

  const [minipimer, setMinipimer] = useState<{id: number; name: string; category: string; status: string; approvedTasks: number; totalTasks: number; readyToExport: boolean}[]>([]);
  const [minipimerLoading, setMinipimerLoading] = useState(false);
  const [minipimerExporting, setMinipimerExporting] = useState<number | null>(null);
  const [minipimerPushing, setMinipimerPushing] = useState<number | null>(null);
  const [minipimerPushResult, setMinipimerPushResult] = useState<Record<number, string>>({});

  const [roleUsers, setRoleUsers] = useState<RoleUser[]>([]);
  const [roleSearch, setRoleSearch] = useState("");
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleBusy, setRoleBusy] = useState<number | null>(null);

  const [botWatch, setBotWatch] = useState<BotWatchRow[]>([]);
  const [botWatchLoading, setBotWatchLoading] = useState(false);
  const [botWatchBusy, setBotWatchBusy] = useState<number | null>(null);
  const [antibotConfig, setAntibotConfig] = useState<AntibotConfig | null>(null);

  const [batchTasks, setBatchTasks] = useState<TaskEntry[]>([emptyTask()]);
  const [currentTask, setCurrentTask] = useState<TaskEntry>(emptyTask());
  const [batchDatasetId, setBatchDatasetId] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchSaved, setBatchSaved] = useState(false);
  const [batchSavedCount, setBatchSavedCount] = useState<number | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const [datasetForm, setDatasetForm] = useState({
    name: "",
    description: "",
    category: "",
    accessType: "ads" as "free" | "ads" | "premium",
    workflowMode: "supervisor_admin",
    votesRequired: 5,
    consensusThreshold: 0.99,
    tokenCost: 0,
    adsRequired: 3,
    price: 0,
    completionTarget: 100,
  });
  const [datasetSaved, setDatasetSaved] = useState(false);
  const [datasetError, setDatasetError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/admin/stats")
      .then(setAdminStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeSection !== "approve") return;
    setDatasetsLoading(true);
    apiFetch("/api/datasets?limit=100")
      .then((data: any) => setAllDatasets(Array.isArray(data) ? data : (data?.datasets ?? [])))
      .catch(() => {})
      .finally(() => setDatasetsLoading(false));
  }, [activeSection]);

  const loadPendingPayments = async () => {
    setPendingLoading(true);
    try {
      const data = await apiFetch("/api/admin/pending-payments");
      setPendingPayments(data);
    } catch { /* ignore */ }
    setPendingLoading(false);
  };

  useEffect(() => {
    if (activeSection === "payments") loadPendingPayments();
  }, [activeSection]);

  const loadBotWatch = async () => {
    setBotWatchLoading(true);
    try {
      const data = await apiFetch("/api/admin/bot-watch");
      setBotWatch(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    try {
      const cfg = await apiFetch("/api/admin/antibot-config");
      setAntibotConfig(cfg ?? null);
    } catch { /* ignore */ }
    setBotWatchLoading(false);
  };

  useEffect(() => {
    if (activeSection === "botwatch") loadBotWatch();
  }, [activeSection]);

  const handleToggleBlock = async (userId: number, block: boolean) => {
    setBotWatchBusy(userId);
    try {
      await apiFetch(`/api/admin/users/${userId}/block`, {
        method: "PATCH",
        body: JSON.stringify({ block }),
      });
      await loadBotWatch();
    } catch { /* ignore */ }
    setBotWatchBusy(null);
  };

  const handleMarkPaid = async (paymentId: number) => {
    setMarkingPaid(paymentId);
    try {
      await apiFetch(`/api/admin/pending-payments/${paymentId}/mark-paid`, {
        method: "PATCH",
        body: JSON.stringify({ txHash: txHashInput[paymentId] ?? null }),
      });
      await loadPendingPayments();
    } catch { /* ignore */ }
    setMarkingPaid(null);
  };

  const handleAddToBatch = () => {
    if (!currentTask.question) return;
    setBatchTasks((prev) => [...prev, { ...currentTask }]);
    setCurrentTask(emptyTask());
  };

  const handleRemoveFromBatch = (index: number) => {
    setBatchTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveBatch = async () => {
    if (batchTasks.length === 0) return;
    setBatchSaving(true);
    setBatchError(null);
    setBatchSaved(false);
    try {
      const result = await apiFetch("/api/admin/tasks/batch", {
        method: "POST",
        body: JSON.stringify({
          datasetId: batchDatasetId ? Number(batchDatasetId) : null,
          tasks: batchTasks.map((t) => ({
            type: t.type,
            dataPayload: {
              question: t.question,
              content: t.content,
              options: [t.option1, t.option2, t.option3, t.option4].filter(Boolean),
            },
            correctAnswer: t.correctAnswer || null,
            difficulty: t.difficulty,
            pointsReward: t.difficulty === "hard" ? 30 : t.difficulty === "medium" ? 20 : 10,
            isGolden: !!t.correctAnswer,
          })),
        }),
      });
      setBatchSaved(true);
      setBatchSavedCount(result?.created ?? batchTasks.length);
      setBatchTasks([emptyTask()]);
      setTimeout(() => setBatchSaved(false), 5000);
    } catch (e: any) {
      setBatchError(e?.message ?? "Errore durante il salvataggio dei task");
    }
    setBatchSaving(false);
  };

  const handleCreateDataset = async () => {
    try {
      await apiFetch("/api/datasets", {
        method: "POST",
        body: JSON.stringify({
          name: datasetForm.name,
          description: datasetForm.description,
          category: datasetForm.category,
          accessType: datasetForm.accessType,
          workflowMode: datasetForm.workflowMode,
          votesRequired: datasetForm.votesRequired,
          consensusThreshold: datasetForm.consensusThreshold,
          tokenCost: datasetForm.tokenCost,
          adsRequired: datasetForm.adsRequired,
          price: datasetForm.price || null,
          completionTarget: datasetForm.completionTarget,
          importMode: "manual",
          requestedTaskCount: datasetForm.completionTarget,
          tags: [datasetForm.category.toLowerCase(), "crowd-labeled"],
        }),
      });
      setDatasetSaved(true);
      setDatasetError(null);
      setDatasetForm({
        name: "", description: "", category: "", accessType: "ads",
        workflowMode: "supervisor_admin", votesRequired: 5, consensusThreshold: 0.99,
        tokenCost: 0, adsRequired: 3, price: 0, completionTarget: 100,
      });
      setTimeout(() => setDatasetSaved(false), 4000);
      apiFetch("/api/admin/stats").then(setAdminStats).catch(() => {});
    } catch (e: any) {
      setDatasetError(e?.message ?? "Errore durante la creazione del dataset");
    }
  };

  const handleApproveDataset = async (id: number) => {
    try {
      const result = await apiFetch(`/api/admin/datasets/${id}/approve-publish`, {
        method: "POST",
        body: JSON.stringify({ adminId: 1 }),
      });
      setApprovalResult(`Dataset #${id} pubblicato. Pagamenti creati: ${result.pendingPaymentsCreated}`);
    } catch (e: any) {
      setApprovalResult(`Errore: ${e.message}`);
    }
  };

  const loadRoleUsers = async (search: string) => {
    setRoleLoading(true);
    try {
      const data = await apiFetch(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`);
      setRoleUsers(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setRoleLoading(false);
  };

  useEffect(() => {
    if (activeSection === "users") loadRoleUsers("");
  }, [activeSection]);

  const handleSetRole = async (userId: number, role: "supervisor" | "moderator" | "none", value: boolean) => {
    setRoleBusy(userId);
    try {
      await apiFetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        body: JSON.stringify({ role, value }),
      });
      await loadRoleUsers(roleSearch);
    } catch (e: any) {
      alert(`Errore aggiornamento ruolo: ${e?.message ?? "sconosciuto"}`);
    }
    setRoleBusy(null);
  };

  useEffect(() => {
    if (activeSection !== "minipimer") return;
    setMinipimerLoading(true);
    apiFetch("/api/datasets/minipimer/summary")
      .then((data: any) => setMinipimer(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setMinipimerLoading(false));
  }, [activeSection]);

  const handleMinipimerExport = async (dsId: number, dsName: string, format: "jsonl" | "json") => {
    setMinipimerExporting(dsId);
    try {
      const res = await fetch(`${API_BASE}/api/datasets/${dsId}/minipimer?format=${format}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Errore durante l'export");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = dsName.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
      a.href = url;
      a.download = `minipimer_${safe}_${dsId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Errore di connessione");
    } finally {
      setMinipimerExporting(null);
    }
  };

  const handleMinipimerPush = async (dsId: number) => {
    setMinipimerPushing(dsId);
    try {
      const result = await apiFetch(`/api/datasets/${dsId}/minipimer/push`, {
        method: "POST",
      });
      setMinipimerPushResult((prev) => ({
        ...prev,
        [dsId]: `Pubblicati ${result.approvedTasks?.toLocaleString?.() ?? result.approvedTasks} record · catalogo Business: ${result.recordCount?.toLocaleString?.() ?? result.recordCount}`,
      }));
      apiFetch("/api/datasets/minipimer/summary")
        .then((data: any) => setMinipimer(Array.isArray(data) ? data : []))
        .catch(() => {});
    } catch (e: any) {
      setMinipimerPushResult((prev) => ({ ...prev, [dsId]: `Errore: ${e?.message ?? "push fallito"}` }));
    } finally {
      setMinipimerPushing(null);
    }
  };

  const navItems: { id: ActiveSection; label: string; icon: React.ElementType }[] = [
    { id: "stats", label: "Stats", icon: BarChart2 },
    { id: "tasks", label: "Tasks", icon: ClipboardList },
    { id: "datasets", label: "Dataset", icon: Database },
    { id: "payments", label: "Pagamenti", icon: Wallet },
    { id: "approve", label: "Approva", icon: CheckCircle },
    { id: "users", label: "Utenti", icon: Users },
    { id: "minipimer", label: "Minipimer", icon: Download },
    { id: "botwatch", label: "Bot Watch", icon: ShieldAlert },
  ];

  return (
    <Layout>
      <div className="p-4 space-y-4 pb-8">
        {/* Header */}
        <div className="flex items-center gap-2 pt-2">
          <Settings className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-black">Admin Panel</h1>
        </div>

        {/* Nav Tabs */}
        <div className="grid grid-cols-4 gap-1">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={cn(
                "flex flex-col items-center gap-0.5 p-2 rounded-lg text-[10px] font-bold uppercase transition-colors",
                activeSection === id
                  ? "bg-primary/20 text-primary border border-primary/40"
                  : "bg-muted/20 text-muted-foreground border border-border/20"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ─── STATS ─────────────────────────────────── */}
        {activeSection === "stats" && (
          <div className="space-y-3">
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Platform Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Total Users", value: adminStats?.totalUsers?.toLocaleString() ?? "—" },
                    { label: "Total Tasks", value: adminStats?.totalTasks?.toLocaleString() ?? "—" },
                    { label: "Responses", value: adminStats?.totalResponses?.toLocaleString() ?? "—" },
                    { label: "Datasets", value: adminStats?.totalDatasets?.toLocaleString() ?? "—" },
                    { label: "Pending Payments", value: adminStats?.pendingPayments?.toString() ?? "—" },
                    { label: "TON Paid Out", value: adminStats ? `${adminStats.totalPaidTon.toFixed(4)} TON` : "—" },
                    { label: "Active Today", value: analytics?.activeUsersToday?.toLocaleString() ?? "—" },
                    { label: "Avg Accuracy", value: analytics ? `${analytics.averageAccuracy?.toFixed(1)}%` : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-card/60 rounded-lg p-2 text-center">
                      <p className="text-lg font-black">{value}</p>
                      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── TASK CREATOR ──────────────────────────── */}
        {activeSection === "tasks" && (
          <div className="space-y-3">
            {batchSaved && (
              <div className="bg-secondary/20 border border-secondary/40 rounded-lg p-2 text-center text-xs text-secondary font-bold flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" /> {batchSavedCount ?? 0} task creati con successo!
              </div>
            )}
            {batchError && (
              <div className="bg-destructive/15 border border-destructive/40 rounded-lg p-2 text-center text-xs text-destructive font-bold flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4" /> {batchError}
              </div>
            )}

            <Card className="border-secondary/30">
              <CardHeader className="p-3 pb-2 border-b border-border/30">
                <CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5" />
                  Task Creator
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2">
                <input
                  className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground"
                  placeholder="Dataset ID (optional)"
                  value={batchDatasetId}
                  onChange={(e) => setBatchDatasetId(e.target.value)}
                />

                {/* Two-column layout: form left, preview right */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Left: Form fields */}
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold">Fields</p>
                    <select
                      className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                      value={currentTask.type}
                      onChange={(e) => setCurrentTask({ ...currentTask, type: e.target.value as TaskEntry["type"] })}
                    >
                      <option value="text">Text</option>
                      <option value="image">Image</option>
                      <option value="classification">Classification</option>
                    </select>
                    <input
                      className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground"
                      placeholder="Question / instruction"
                      value={currentTask.question}
                      onChange={(e) => setCurrentTask({ ...currentTask, question: e.target.value })}
                    />
                    <textarea
                      className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground resize-none"
                      rows={2}
                      placeholder="Content (text, image URL, etc.)"
                      value={currentTask.content}
                      onChange={(e) => setCurrentTask({ ...currentTask, content: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["option1", "option2", "option3", "option4"] as const).map((opt, i) => (
                        <input
                          key={opt}
                          className="p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground"
                          placeholder={`Option ${i + 1}`}
                          value={currentTask[opt]}
                          onChange={(e) => setCurrentTask({ ...currentTask, [opt]: e.target.value })}
                        />
                      ))}
                    </div>
                    <input
                      className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground"
                      placeholder="Correct answer (golden task)"
                      value={currentTask.correctAnswer}
                      onChange={(e) => setCurrentTask({ ...currentTask, correctAnswer: e.target.value })}
                    />
                    <select
                      className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                      value={currentTask.difficulty}
                      onChange={(e) => setCurrentTask({ ...currentTask, difficulty: e.target.value as TaskEntry["difficulty"] })}
                    >
                      <option value="easy">Easy — 10 pts</option>
                      <option value="medium">Medium — 20 pts</option>
                      <option value="hard">Hard — 30 pts</option>
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={handleAddToBatch}
                      disabled={!currentTask.question}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add to batch
                    </Button>
                  </div>

                  {/* Right: Live preview */}
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Preview
                    </p>
                    <div className="rounded-lg border border-border/50 bg-card/40 p-3 min-h-[160px]">
                      {currentTask.question ? (
                        <div className="space-y-2">
                          <Badge variant="outline" className="text-[9px]">{currentTask.type}</Badge>
                          <p className="text-xs font-bold">{currentTask.question}</p>
                          {currentTask.content && (
                            <p className="text-[11px] text-muted-foreground bg-muted/30 rounded p-1.5 italic line-clamp-3">
                              {currentTask.content}
                            </p>
                          )}
                          {[currentTask.option1, currentTask.option2, currentTask.option3, currentTask.option4].filter(Boolean).map((opt, i) => (
                            <div
                              key={i}
                              className={cn(
                                "text-[11px] p-1.5 rounded border",
                                opt === currentTask.correctAnswer
                                  ? "border-secondary/60 bg-secondary/10 text-secondary font-bold"
                                  : "border-border/40 bg-muted/20"
                              )}
                            >
                              {opt}
                            </div>
                          ))}
                          <p className="text-[9px] text-muted-foreground uppercase">
                            {currentTask.difficulty} • {currentTask.difficulty === "hard" ? 30 : currentTask.difficulty === "medium" ? 20 : 10} pts
                            {currentTask.correctAnswer && " • Golden ✓"}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground/50 text-center pt-8">Fill the form to preview</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Batch Queue */}
            {batchTasks.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="p-3 pb-2 border-b border-border/30">
                  <CardTitle className="text-xs uppercase text-muted-foreground flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <ClipboardList className="w-3.5 h-3.5" />
                      Batch Queue ({batchTasks.length})
                    </span>
                    <Button
                      size="sm"
                      className="text-[10px] h-6 px-2"
                      onClick={handleSaveBatch}
                      disabled={batchSaving}
                    >
                      {batchSaving ? "Saving..." : `Save ${batchTasks.length} Tasks`}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-border/20 max-h-48 overflow-y-auto">
                  {batchTasks.map((task, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{task.question || "(empty)"}</p>
                        <p className="text-[10px] text-muted-foreground">{task.type} • {task.difficulty}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveFromBatch(i)}
                        className="ml-2 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ─── CREATE DATASET ────────────────────────── */}
        {activeSection === "datasets" && (
          <Card className="border-accent/30">
            <CardHeader className="p-3 pb-2 border-b border-border/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-2">
                  <Database className="w-3.5 h-3.5" />
                  Create Dataset
                </CardTitle>
                {datasetSaved && (
                  <Badge variant="outline" className="text-secondary border-secondary/40 text-[10px]">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Saved!
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              <input
                className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground"
                placeholder="Dataset name *"
                value={datasetForm.name}
                onChange={(e) => setDatasetForm({ ...datasetForm, name: e.target.value })}
              />
              <textarea
                className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground resize-none"
                rows={2}
                placeholder="Description *"
                value={datasetForm.description}
                onChange={(e) => setDatasetForm({ ...datasetForm, description: e.target.value })}
              />
              <input
                className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground"
                placeholder="Category (NLP, Vision, Audio…)"
                value={datasetForm.category}
                onChange={(e) => setDatasetForm({ ...datasetForm, category: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                  value={datasetForm.accessType}
                  onChange={(e) => setDatasetForm({ ...datasetForm, accessType: e.target.value as any })}
                >
                  <option value="free">Free</option>
                  <option value="ads">Unlock with Ads</option>
                  <option value="premium">Premium</option>
                </select>
                <select
                  className="p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                  value={datasetForm.workflowMode}
                  onChange={(e) => setDatasetForm({ ...datasetForm, workflowMode: e.target.value })}
                >
                  <option value="consensus">Crowd only</option>
                  <option value="supervisor_admin">Crowd + Controller + Admin</option>
                  <option value="admin">Crowd + Admin</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1">Votes required</p>
                  <input
                    type="number"
                    className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                    value={datasetForm.votesRequired}
                    onChange={(e) => setDatasetForm({ ...datasetForm, votesRequired: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1">Threshold</p>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                    value={datasetForm.consensusThreshold}
                    onChange={(e) => setDatasetForm({ ...datasetForm, consensusThreshold: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1">Ads req.</p>
                  <input
                    type="number"
                    className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                    value={datasetForm.adsRequired}
                    onChange={(e) => setDatasetForm({ ...datasetForm, adsRequired: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1">Fee (€)</p>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                    value={datasetForm.price}
                    onChange={(e) => setDatasetForm({ ...datasetForm, price: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground mb-1">Completion target</p>
                  <input
                    type="number"
                    className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                    value={datasetForm.completionTarget}
                    onChange={(e) => setDatasetForm({ ...datasetForm, completionTarget: Number(e.target.value) })}
                  />
                </div>
              </div>

              <Button
                className="w-full text-xs font-bold"
                onClick={handleCreateDataset}
                disabled={!datasetForm.name || !datasetForm.description || !datasetForm.category}
              >
                Create Dataset
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── PENDING PAYMENTS ──────────────────────── */}
        {activeSection === "payments" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" />
                Pending Payments
              </h2>
              <Button size="sm" variant="outline" className="text-xs" onClick={loadPendingPayments}>
                Refresh
              </Button>
            </div>
            {pendingLoading ? (
              <div className="space-y-2">
                {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : pendingPayments.length === 0 ? (
              <Card className="border-border/30">
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No pending payments — all caught up!
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {pendingPayments.map(({ payment, user }) => (
                  <Card key={payment.id} className="border-yellow-400/30 bg-yellow-400/5">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold">{user?.username ?? `User #${payment.userId}`}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            {payment.walletAddress.slice(0, 10)}…{payment.walletAddress.slice(-8)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-yellow-400">{payment.amountTon.toFixed(6)} TON</p>
                          <p className="text-[9px] text-muted-foreground">{payment.reason}</p>
                        </div>
                      </div>
                      <input
                        className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground"
                        placeholder="TX hash (optional)"
                        value={txHashInput[payment.id] ?? ""}
                        onChange={(e) => setTxHashInput((prev) => ({ ...prev, [payment.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        className="w-full text-xs bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/30"
                        onClick={() => handleMarkPaid(payment.id)}
                        disabled={markingPaid === payment.id}
                      >
                        <Coins className="w-3 h-3 mr-1" />
                        {markingPaid === payment.id ? "Marking..." : "Mark as Paid"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── APPROVE DATASETS ──────────────────────── */}
        {activeSection === "approve" && (
          <div className="space-y-3">
            <h2 className="text-sm font-black flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-secondary" />
              Dataset Approval &amp; Export
            </h2>
            {approvalResult && (
              <div className="bg-secondary/10 border border-secondary/30 rounded-lg p-3 text-xs text-secondary">
                {approvalResult}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Approve to publish a dataset, run lottery, and create TON payments. Export JSON/CSV anytime for delivery to clients.
            </p>
            {datasetsLoading && (
              <div className="text-xs text-muted-foreground text-center py-4">Loading datasets…</div>
            )}
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {(allDatasets.length > 0 ? allDatasets : Array.from({length: 20}, (_, i) => ({id: i + 10, name: `Dataset #${i + 10}`, status: 'active', recordCount: 1000000}))).map((ds) => (
                <Card key={ds.id} className="border-border/40">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-xs font-bold">{ds.name || `Dataset #${ds.id}`}</p>
                        <p className="text-[10px] text-muted-foreground">
                          #{ds.id} · {(ds.recordCount ?? 0).toLocaleString()} tasks · {ds.status}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs border-secondary/40 text-secondary hover:bg-secondary/10"
                        onClick={() => handleApproveDataset(ds.id)}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Approve
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={`${API_BASE}/api/datasets/${ds.id}/export?format=json`}
                        download
                        className="flex-1"
                      >
                        <Button size="sm" variant="ghost" className="w-full text-[10px] h-7 border border-border/40 hover:border-primary/40 hover:text-primary">
                          <Download className="w-3 h-3 mr-1" />
                          Export JSON
                        </Button>
                      </a>
                      <a
                        href={`${API_BASE}/api/datasets/${ds.id}/export?format=csv`}
                        download
                        className="flex-1"
                      >
                        <Button size="sm" variant="ghost" className="w-full text-[10px] h-7 border border-border/40 hover:border-primary/40 hover:text-primary">
                          <Download className="w-3 h-3 mr-1" />
                          Export CSV
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Admin approval is always required before publishing. All datasets (including non-business) must be approved.
            </p>
          </div>
        )}

        {/* ─── MINIPIMER ──────────────────────────────── */}
        {activeSection === "minipimer" && (
          <div className="space-y-3">
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-2">
                  <Download className="w-3.5 h-3.5" />
                  Minipimer — Export Dataset
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1">
                <p className="text-[10px] text-muted-foreground mb-3">
                  Compatta tutte le risposte approvate di un dataset in un singolo file JSONL o JSON, pronto per training AI.
                  Solo i task con <strong>final_label</strong> impostato vengono inclusi.
                </p>
                {minipimerLoading && (
                  <div className="text-xs text-muted-foreground text-center py-6">Caricamento dataset…</div>
                )}
                <div className="space-y-2 max-h-[65vh] overflow-y-auto">
                  {minipimer.map((ds) => (
                    <Card key={ds.id} className={cn("border-border/40", ds.readyToExport && "border-primary/30")}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0 mr-2">
                            <p className="text-xs font-bold truncate">{ds.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              #{ds.id} · {ds.category} · {ds.status}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 bg-muted/30 rounded-full h-1.5">
                                <div
                                  className="bg-primary h-1.5 rounded-full transition-all"
                                  style={{ width: `${ds.totalTasks > 0 ? Math.min(100, (ds.approvedTasks / ds.totalTasks) * 100) : 0}%` }}
                                />
                              </div>
                              <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                                {ds.approvedTasks.toLocaleString()} / {ds.totalTasks.toLocaleString()} approvati
                              </span>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn("text-[9px] shrink-0", ds.readyToExport ? "text-secondary border-secondary/40" : "text-muted-foreground")}
                          >
                            {ds.readyToExport ? "Pronto" : "Vuoto"}
                          </Badge>
                        </div>
                        {ds.readyToExport ? (
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 text-[10px] h-7 border-primary/40 text-primary hover:bg-primary/10"
                              disabled={minipimerExporting === ds.id}
                              onClick={() => handleMinipimerExport(ds.id, ds.name, "jsonl")}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              {minipimerExporting === ds.id ? "Export…" : "JSONL"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 text-[10px] h-7 border-border/40 hover:border-primary/40 hover:text-primary"
                              disabled={minipimerExporting === ds.id}
                              onClick={() => handleMinipimerExport(ds.id, ds.name, "json")}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              JSON
                            </Button>
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground text-center py-1">
                            Nessun task approvato — completa il workflow di consenso prima
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {!minipimerLoading && minipimer.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-8">Nessun dataset trovato</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── USERS ─────────────────────────────────── */}
        {activeSection === "users" && (
          <Card className="border-border/50">
            <CardHeader className="p-3 pb-2 border-b border-border/30">
              <CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                All Users
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/20 max-h-[60vh] overflow-y-auto">
              {users?.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-bold">{user.username}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      #{user.telegramId ?? "—"} · ref: {(user as any).referralCode ?? "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant="outline"
                      className={cn("text-[9px]",
                        user.level === "expert" ? "text-yellow-400 border-yellow-400/40" :
                        user.level === "pro" ? "text-primary border-primary/40" :
                        "text-muted-foreground"
                      )}
                    >
                      {user.level}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{user.points.toLocaleString()} pts</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ─── BOT WATCH ─────────────────────────────────── */}
        {activeSection === "botwatch" && (
          <div className="space-y-3">
            <Card className="border-red-500/30 bg-red-500/5">
              <CardHeader className="p-3 pb-2 flex-row items-center justify-between">
                <CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                  Anti-Bot Monitor
                </CardTitle>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={loadBotWatch}>
                  Aggiorna
                </Button>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Punteggio di rischio per utente in base al comportamento sugli annunci.
                  A <span className="font-bold text-red-400">100</span> l'utente è bloccato e non guadagna finché non lo sblocchi.
                </p>
              </CardContent>
            </Card>

            {botWatchLoading && <Skeleton className="h-32 w-full rounded-xl" />}

            {!botWatchLoading && botWatch.length === 0 && (
              <Card className="border-border/30">
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  Nessuna attività sugli annunci registrata.
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              {botWatch.map((row) => {
                const cooldownActive = row.cooldownUntil ? new Date(row.cooldownUntil).getTime() > Date.now() : false;
                const riskColor = row.riskScore >= 100
                  ? "text-red-400 border-red-400/50 bg-red-400/10"
                  : row.riskScore >= 50
                    ? "text-yellow-400 border-yellow-400/50 bg-yellow-400/10"
                    : "text-secondary border-secondary/40 bg-secondary/10";
                return (
                  <Card key={row.userId} className={cn("border", row.blocked ? "border-red-500/50 bg-red-500/5" : "border-border/30")}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold truncate">{row.username}</p>
                            {row.blocked && (
                              <Badge variant="outline" className="text-[9px] text-red-400 border-red-400/50 bg-red-400/10">
                                BLOCCATO
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            id {row.userId} · tg {row.telegramId ?? "—"}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("text-[10px] font-black shrink-0", riskColor)}>
                          RISK {row.riskScore}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                        <div className="rounded-md bg-muted/20 p-1.5">
                          <p className="text-[9px] text-muted-foreground uppercase">Sospetti</p>
                          <p className="text-sm font-bold">{row.suspiciousCount}</p>
                        </div>
                        <div className="rounded-md bg-muted/20 p-1.5">
                          <p className="text-[9px] text-muted-foreground uppercase">Oggi</p>
                          <p className="text-sm font-bold">{row.adsWatchedToday}</p>
                        </div>
                        <div className="rounded-md bg-muted/20 p-1.5">
                          <p className="text-[9px] text-muted-foreground uppercase">Totali</p>
                          <p className="text-sm font-bold">{row.totalAdsWatched}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] text-muted-foreground">
                          {cooldownActive ? "In pausa (cooldown)" : "Attivo"}
                          {row.lastViewTime ? ` · ultimo ${new Date(row.lastViewTime).toLocaleTimeString()}` : ""}
                        </p>
                        {row.blocked ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-secondary border-secondary/40"
                            disabled={botWatchBusy === row.userId}
                            onClick={() => handleToggleBlock(row.userId, false)}
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                            Sblocca
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-400 border-red-400/40"
                            disabled={botWatchBusy === row.userId}
                            onClick={() => handleToggleBlock(row.userId, true)}
                          >
                            <Ban className="w-3.5 h-3.5 mr-1" />
                            Blocca
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
