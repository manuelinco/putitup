import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  Plus,
  CheckCircle,
  Loader2,
  Trash2,
  ChevronRight,
  Clock,
  Star,
  Coins,
  Zap,
  ImageIcon,
  FileText,
  Tag,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/api";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Error ${res.status}`);
  return data;
}

interface ContribDataset {
  id: number;
  userId: number;
  title: string;
  description: string | null;
  taskType: string;
  labelingInstructions: string | null;
  labelOptions: string[] | null;
  totalItems: number;
  labeledItems: number;
  qualityScore: number | null;
  status: string;
  datasetId: number | null;
  rewardTon: number | null;
  rewardEnergy: number | null;
  rewardPaid: boolean;
  createdAt: string;
}

type Step = "list" | "create" | "add-items";

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Draft", color: "text-muted-foreground border-border/40", icon: Clock },
  labeling: { label: "Being Labeled", color: "text-accent border-accent/40", icon: RefreshCw },
  completed: { label: "Completed", color: "text-secondary border-secondary/40", icon: CheckCircle },
  rewarded: { label: "Rewarded", color: "text-primary border-primary/40", icon: Coins },
};

const typeConfig: Record<string, { label: string; icon: React.ElementType }> = {
  text: { label: "Text", icon: FileText },
  image: { label: "Image", icon: ImageIcon },
  classification: { label: "Classification", icon: Tag },
};

export default function UploadPage() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("list");
  const [datasets, setDatasets] = useState<ContribDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDataset, setCurrentDataset] = useState<ContribDataset | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    taskType: "text",
    labelingInstructions: "",
    labelOptions: "",
  });
  const [creating, setCreating] = useState(false);

  const [items, setItems] = useState<{ content: string; contentType: string }[]>([]);
  const [itemInput, setItemInput] = useState("");
  const [itemType, setItemType] = useState("text");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const loadDatasets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/upload/my-datasets/${user.id}`);
      setDatasets(Array.isArray(data) ? data : []);
    } catch {
      setDatasets([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  const handleCreate = async () => {
    if (!user || !form.title || !form.taskType) return;
    setCreating(true);
    try {
      const labelOptions = form.labelOptions
        ? form.labelOptions.split(",").map((s) => s.trim()).filter(Boolean)
        : ["Yes", "No"];
      const ds = await apiFetch("/api/upload/datasets", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          title: form.title,
          description: form.description || null,
          taskType: form.taskType,
          labelingInstructions: form.labelingInstructions || null,
          labelOptions,
        }),
      });
      setCurrentDataset(ds);
      setStep("add-items");
      setForm({ title: "", description: "", taskType: "text", labelingInstructions: "", labelOptions: "" });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleAddItem = () => {
    if (!itemInput.trim()) return;
    setItems((prev) => [...prev, { content: itemInput.trim(), contentType: itemType }]);
    setItemInput("");
  };

  const handleRemoveItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!currentDataset || items.length < 3) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      await apiFetch(`/api/upload/datasets/${currentDataset.id}/items`, {
        method: "POST",
        body: JSON.stringify({ items }),
      });
      await apiFetch(`/api/upload/datasets/${currentDataset.id}/submit`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSubmitMsg("Dataset submitted! The crowd is now labeling your data.");
      await loadDatasets();
      setTimeout(() => {
        setStep("list");
        setItems([]);
        setCurrentDataset(null);
        setSubmitMsg(null);
      }, 2500);
    } catch (e: any) {
      setSubmitMsg(`Error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="p-4 space-y-4 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Upload Data
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Submit your data · earn TON when labeled
            </p>
          </div>
          {step !== "list" ? (
            <Button variant="ghost" size="sm" onClick={() => { setStep("list"); setItems([]); setCurrentDataset(null); }}>
              ← Back
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={loadDatasets} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          )}
        </div>

        {/* Info card */}
        {step === "list" && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-bold">How it works</p>
              <div className="space-y-1.5">
                {[
                  "1. Upload your text or image data",
                  "2. The crowd labels it at 99% consensus",
                  "3. You earn TON + Energy proportional to quality",
                ].map((s) => (
                  <p key={s} className="text-[11px] text-muted-foreground flex items-start gap-2">
                    <Star className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                    {s}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* LIST step */}
        {step === "list" && (
          <>
            <Button className="w-full font-bold" onClick={() => setStep("create")}>
              <Plus className="w-4 h-4 mr-2" /> New Dataset Upload
            </Button>

            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : datasets.length === 0 ? (
              <Card className="border-border/40 text-center">
                <CardContent className="p-8 space-y-2">
                  <Upload className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                  <p className="font-black text-sm">No uploads yet</p>
                  <p className="text-xs text-muted-foreground">Submit your first dataset to start earning.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {datasets.map((ds) => {
                  const cfg = statusConfig[ds.status] ?? statusConfig.pending;
                  const StatusIcon = cfg.icon;
                  const TypeIcon = typeConfig[ds.taskType]?.icon ?? FileText;
                  const pct = ds.totalItems > 0 ? Math.round((ds.labeledItems / ds.totalItems) * 100) : 0;
                  return (
                    <Card key={ds.id} className="border-border/50 bg-card/60">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <TypeIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <p className="text-sm font-bold truncate">{ds.title}</p>
                            </div>
                            <p className="text-[11px] text-muted-foreground line-clamp-1">
                              {ds.description ?? ds.labelingInstructions ?? "No description"}
                            </p>
                          </div>
                          <Badge variant="outline" className={cn("text-[9px] ml-2 flex-shrink-0 flex items-center gap-1", cfg.color)}>
                            <StatusIcon className="w-2.5 h-2.5" />
                            {cfg.label}
                          </Badge>
                        </div>

                        {ds.status !== "pending" && (
                          <>
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>Labeling progress</span>
                              <span className="font-bold">{ds.labeledItems}/{ds.totalItems} items ({pct}%)</span>
                            </div>
                            <Progress value={pct} className="h-1.5" />
                          </>
                        )}

                        {ds.status === "pending" && (
                          <p className="text-[11px] text-muted-foreground">
                            {ds.totalItems} item{ds.totalItems !== 1 ? "s" : ""} — not yet submitted
                          </p>
                        )}

                        {(ds.status === "completed" || ds.status === "rewarded") && ds.rewardTon != null && (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10 border border-primary/30">
                              <Coins className="w-3 h-3 text-primary" />
                              <span className="text-xs font-black text-primary">+{ds.rewardTon.toFixed(6)} TON</span>
                            </div>
                            {ds.rewardEnergy != null && (
                              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary/10 border border-secondary/30">
                                <Zap className="w-3 h-3 text-secondary" />
                                <span className="text-xs font-black text-secondary">+{ds.rewardEnergy} Energy</span>
                              </div>
                            )}
                            {ds.qualityScore != null && (
                              <span className="text-[10px] text-muted-foreground">Quality: {ds.qualityScore.toFixed(0)}%</span>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* CREATE step */}
        {step === "create" && (
          <Card className="border-primary/30">
            <CardHeader className="p-4 pb-2 border-b border-border/30">
              <CardTitle className="text-xs uppercase text-muted-foreground flex items-center gap-2">
                <Plus className="w-3.5 h-3.5" /> New Dataset
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Title *</p>
                <input
                  className="w-full p-2.5 rounded-lg bg-muted/40 border border-border/50 text-sm placeholder:text-muted-foreground"
                  placeholder="e.g. Product images classification"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Description</p>
                <textarea
                  className="w-full p-2.5 rounded-lg bg-muted/40 border border-border/50 text-sm placeholder:text-muted-foreground resize-none"
                  rows={2}
                  placeholder="Brief description of your data"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Task Type *</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["text", "image", "classification"] as const).map((t) => {
                    const Icon = typeConfig[t].icon;
                    return (
                      <button
                        key={t}
                        onClick={() => setForm({ ...form, taskType: t })}
                        className={cn(
                          "p-2.5 rounded-lg border text-xs font-bold flex flex-col items-center gap-1 transition-all",
                          form.taskType === t
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border/40 bg-muted/20 text-muted-foreground"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {typeConfig[t].label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Labeling Instructions</p>
                <input
                  className="w-full p-2.5 rounded-lg bg-muted/40 border border-border/50 text-sm placeholder:text-muted-foreground"
                  placeholder="e.g. Is this image a cat or a dog?"
                  value={form.labelingInstructions}
                  onChange={(e) => setForm({ ...form, labelingInstructions: e.target.value })}
                />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">
                  Label Options (comma-separated)
                </p>
                <input
                  className="w-full p-2.5 rounded-lg bg-muted/40 border border-border/50 text-sm placeholder:text-muted-foreground"
                  placeholder="e.g. Cat, Dog, Other"
                  value={form.labelOptions}
                  onChange={(e) => setForm({ ...form, labelOptions: e.target.value })}
                />
                <p className="text-[9px] text-muted-foreground mt-1">Default: Yes / No</p>
              </div>
              <Button
                className="w-full font-bold"
                onClick={handleCreate}
                disabled={creating || !form.title}
              >
                {creating ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
                ) : (
                  <>Next: Add Items <ChevronRight className="w-4 h-4 ml-1" /></>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ADD ITEMS step */}
        {step === "add-items" && currentDataset && (
          <div className="space-y-3">
            {submitMsg && (
              <div className={cn(
                "rounded-lg p-3 text-xs font-bold text-center border",
                submitMsg.startsWith("Error")
                  ? "bg-destructive/10 border-destructive/30 text-destructive"
                  : "bg-secondary/10 border-secondary/30 text-secondary"
              )}>
                {submitMsg}
              </div>
            )}

            <Card className="border-secondary/30">
              <CardHeader className="p-3 pb-2 border-b border-border/30">
                <CardTitle className="text-xs uppercase text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5" />
                    Add Items to "{currentDataset.title}"
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {items.length} added
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setItemType("text")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                      itemType === "text" ? "border-primary/60 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground"
                    )}
                  >
                    <FileText className="w-3 h-3 inline mr-1" />Text
                  </button>
                  <button
                    onClick={() => setItemType("image_url")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                      itemType === "image_url" ? "border-primary/60 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground"
                    )}
                  >
                    <ImageIcon className="w-3 h-3 inline mr-1" />Image URL
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    className="flex-1 p-2.5 rounded-lg bg-muted/40 border border-border/50 text-sm placeholder:text-muted-foreground"
                    placeholder={itemType === "text" ? "Enter text content…" : "https://example.com/image.jpg"}
                    value={itemInput}
                    onChange={(e) => setItemInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddItem(); } }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddItem}
                    disabled={!itemInput.trim()}
                    className="flex-shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {items.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border/30 divide-y divide-border/20">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {item.contentType === "image_url"
                            ? <ImageIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            : <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          }
                          <p className="text-xs truncate">{item.content}</p>
                        </div>
                        <button onClick={() => handleRemoveItem(i)} className="ml-2 text-muted-foreground hover:text-destructive flex-shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {items.length < 3 && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    Add at least 3 items to submit ({3 - items.length} more needed)
                  </p>
                )}

                <Button
                  className="w-full font-bold"
                  onClick={handleSubmit}
                  disabled={submitting || items.length < 3}
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</>
                  ) : (
                    <><CheckCircle className="w-4 h-4 mr-2" /> Submit {items.length} Items for Labeling</>
                  )}
                </Button>

                <div className="rounded-lg bg-muted/30 p-2.5 space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Expected rewards</p>
                  <div className="flex gap-3">
                    <div className="flex items-center gap-1">
                      <Coins className="w-3 h-3 text-primary" />
                      <span className="text-[11px]">~{(items.length * 0.000008).toFixed(6)} TON</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-secondary" />
                      <span className="text-[11px]">~{Math.min(1000, items.length * 5)} Energy</span>
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground">Final reward depends on label quality (consensus %)</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
