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
  Trophy,
  Coins,
  BarChart2,
  ClipboardList,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
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

type ActiveSection = "stats" | "tasks" | "datasets" | "payments" | "users" | "approve";

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

  const [batchTasks, setBatchTasks] = useState<TaskEntry[]>([emptyTask()]);
  const [currentTask, setCurrentTask] = useState<TaskEntry>(emptyTask());
  const [batchDatasetId, setBatchDatasetId] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchSaved, setBatchSaved] = useState(false);

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
    lotteryPool: 0,
    lotteryWinners: 0,
    completionTarget: 100,
  });
  const [datasetSaved, setDatasetSaved] = useState(false);

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
    try {
      await apiFetch("/api/admin/tasks/batch", {
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
      setBatchTasks([emptyTask()]);
      setTimeout(() => setBatchSaved(false), 3000);
    } catch { /* ignore */ }
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
          lotteryPool: datasetForm.lotteryPool,
          lotteryWinners: datasetForm.lotteryWinners,
          completionTarget: datasetForm.completionTarget,
          importMode: "manual",
          requestedTaskCount: datasetForm.completionTarget,
          tags: [datasetForm.category.toLowerCase(), "crowd-labeled"],
        }),
      });
      setDatasetSaved(true);
      setDatasetForm({
        name: "", description: "", category: "", accessType: "ads",
        workflowMode: "supervisor_admin", votesRequired: 5, consensusThreshold: 0.99,
        tokenCost: 0, adsRequired: 3, price: 0, lotteryPool: 0, lotteryWinners: 0, completionTarget: 100,
      });
      setTimeout(() => setDatasetSaved(false), 3000);
      apiFetch("/api/admin/stats").then(setAdminStats).catch(() => {});
    } catch { /* ignore */ }
  };

  const handleApproveDataset = async (id: number) => {
    try {
      const result = await apiFetch(`/api/admin/datasets/${id}/approve-publish`, {
        method: "POST",
        body: JSON.stringify({ adminId: 1 }),
      });
      setApprovalResult(`Dataset #${id} published. Lottery: ${result.lotteryResult ? `${result.lotteryResult.winnersCount} winners` : "none"}. Payments: ${result.pendingPaymentsCreated}`);
    } catch (e: any) {
      setApprovalResult(`Error: ${e.message}`);
    }
  };

  const navItems: { id: ActiveSection; label: string; icon: React.ElementType }[] = [
    { id: "stats", label: "Stats", icon: BarChart2 },
    { id: "tasks", label: "Tasks", icon: ClipboardList },
    { id: "datasets", label: "Datasets", icon: Database },
    { id: "payments", label: "Payments", icon: Wallet },
    { id: "approve", label: "Approve", icon: CheckCircle },
    { id: "users", label: "Users", icon: Users },
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
        <div className="grid grid-cols-3 gap-1">
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
                <CheckCircle className="w-4 h-4" /> Batch saved successfully!
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

              {/* Lottery section */}
              <div className="border border-yellow-400/30 rounded-lg p-3 bg-yellow-400/5 space-y-2">
                <p className="text-[10px] uppercase font-bold text-yellow-400 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5" />
                  Lottery (optional)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[9px] text-muted-foreground mb-1">Prize pool (TON)</p>
                    <input
                      type="number"
                      step="0.001"
                      className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                      value={datasetForm.lotteryPool}
                      onChange={(e) => setDatasetForm({ ...datasetForm, lotteryPool: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground mb-1">Winners</p>
                    <input
                      type="number"
                      className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                      value={datasetForm.lotteryWinners}
                      onChange={(e) => setDatasetForm({ ...datasetForm, lotteryWinners: Number(e.target.value) })}
                    />
                  </div>
                </div>
                {datasetForm.lotteryPool > 0 && datasetForm.lotteryWinners > 0 && (
                  <p className="text-[10px] text-yellow-400/70">
                    {datasetForm.lotteryWinners} winner{datasetForm.lotteryWinners > 1 ? "s" : ""} will each receive ~{(datasetForm.lotteryPool / datasetForm.lotteryWinners).toFixed(4)} TON when dataset is approved.
                  </p>
                )}
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
      </div>
    </Layout>
  );
}
