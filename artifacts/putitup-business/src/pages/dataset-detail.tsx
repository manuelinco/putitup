import { useParams, Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import { useBusinessAuth } from "@/hooks/useBusinessAuth";
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  FileText,
  Globe,
  Lock,
  ShieldCheck,
  Star,
  Users,
  Zap,
  Loader2,
  Eye,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

const datasets: Record<string, {
  name: string;
  category: string;
  description: string;
  longDescription: string;
  samples: string;
  languages: string[];
  tier: "BASIC" | "MEDIUM" | "PREMIUM";
  accuracy: number;
  adsRequired?: number;
  tags: string[];
  formats: string[];
  lastUpdated: string;
  contributors: string;
  schema: { field: string; type: string; description: string }[];
}> = {
  "nlp-sentiment-01": {
    name: "Multilingual Sentiment — v3",
    category: "NLP",
    description: "Sentence-level sentiment labels across 12 languages.",
    longDescription:
      "This dataset contains 120,000 sentence-level sentiment annotations across 12 languages. Each sample was labeled by at least 5 independent crowd contributors and passed controller and admin review. Labels include positive, negative, and neutral, with confidence scores derived from crowd consensus.",
    samples: "120,000",
    languages: ["EN", "IT", "FR", "DE", "ES", "PT", "NL", "PL", "RU", "JA", "ZH", "AR"],
    tier: "BASIC",
    accuracy: 98.7,
    adsRequired: 3,
    tags: ["sentiment", "classification", "multilingual"],
    formats: ["CSV", "JSONL"],
    lastUpdated: "2025-04-10",
    contributors: "3,200+",
    schema: [
      { field: "id", type: "string", description: "Unique sample identifier" },
      { field: "text", type: "string", description: "Input sentence" },
      { field: "language", type: "string", description: "ISO 639-1 language code" },
      { field: "label", type: "enum", description: "positive | negative | neutral" },
      { field: "confidence", type: "float", description: "Crowd consensus score (0–1)" },
    ],
  },
  "vision-bbox-02": {
    name: "Urban Object Detection — v2",
    category: "Vision",
    description: "Bounding box annotations for 40 urban object classes.",
    longDescription:
      "55,000 annotated urban scene images with bounding boxes for 40 object classes including vehicles, pedestrians, signage, and infrastructure. COCO-format compatible. Annotators completed interactive anti-bot challenges before submitting each batch.",
    samples: "55,000",
    languages: ["EN"],
    tier: "MEDIUM",
    accuracy: 99.2,
    adsRequired: 5,
    tags: ["bounding-box", "object-detection", "urban"],
    formats: ["JSONL", "Parquet"],
    lastUpdated: "2025-03-28",
    contributors: "1,800+",
    schema: [
      { field: "image_id", type: "string", description: "Image identifier" },
      { field: "file_name", type: "string", description: "Image filename" },
      { field: "bbox", type: "array[float]", description: "[x, y, width, height]" },
      { field: "category_id", type: "int", description: "Class label ID (0–39)" },
      { field: "area", type: "float", description: "Bounding box area in pixels" },
    ],
  },
};

const tierColor: Record<string, string> = {
  BASIC: "bg-secondary/20 text-secondary border-secondary/30",
  MEDIUM: "bg-primary/20 text-primary border-primary/30",
  PREMIUM: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

interface AdWatchState {
  adsWatched: number;
  adsRequired: number;
  unlocked: boolean;
}

interface LiveDataset {
  id: number;
  name: string;
  description: string;
  category: string;
  qualityScore: number | null;
  recordCount: number | null;
  status: string;
  downloadCount: number;
  accessType: string;
  adsRequired: number;
}

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>();
  const { client } = useBusinessAuth();
  const [, navigate] = useLocation();

  const staticDataset = datasets[id ?? ""];

  const [liveDataset, setLiveDataset] = useState<LiveDataset | null>(null);
  const [adState, setAdState] = useState<AdWatchState | null>(null);
  const [watchingAd, setWatchingAd] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [adError, setAdError] = useState<string | null>(null);
  const [isAlreadyUnlocked, setIsAlreadyUnlocked] = useState(false);

  const numericId = Number(id);
  const isNumericId = Number.isFinite(numericId);

  useEffect(() => {
    if (!isNumericId) return;
    fetch(`${API_BASE}/api/datasets/${numericId}`)
      .then((r) => r.json())
      .then((data) => { if (data && data.id) setLiveDataset(data); })
      .catch(() => {});
  }, [numericId]);

  useEffect(() => {
    if (!client || !isNumericId) return;
    fetch(`${API_BASE}/api/clients/${client.id}/datasets`)
      .then((r) => r.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          const found = data.find((a: any) => a.datasetId === numericId);
          if (found) setIsAlreadyUnlocked(true);
        }
      })
      .catch(() => {});
  }, [client, numericId]);

  const currentDataset = isNumericId ? liveDataset : staticDataset;
  const adsRequired = isNumericId
    ? (liveDataset?.adsRequired ?? 3)
    : (staticDataset?.adsRequired ?? 3);
  const tier = isNumericId ? "BASIC" : (staticDataset?.tier ?? "BASIC");

  const handleStartUnlock = () => {
    if (!client) {
      navigate("/login");
      return;
    }
    setAdState({ adsWatched: 0, adsRequired, unlocked: false });
    setAdError(null);
  };

  const handleWatchAd = async () => {
    if (!client || !adState) return;
    setWatchingAd(true);
    setAdError(null);
    try {
      const challengeRes = await fetch(`${API_BASE}/api/auth/ads/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id }),
      });
      if (!challengeRes.ok) {
        setAdError("Could not start ad session");
        setWatchingAd(false);
        return;
      }
      const { challengeToken } = await challengeRes.json();
      await new Promise((r) => setTimeout(r, 20_000));
      const res = await fetch(`${API_BASE}/api/clients/${client.id}/ads/watch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId: isNumericId ? numericId : id,
          durationSeconds: 20,
          completionToken: challengeToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdError(data.error ?? "Ad error");
        setWatchingAd(false);
        return;
      }
      const newCount = adState.adsWatched + 1;
      if (newCount >= adsRequired) {
        await handleUnlock();
        setAdState({ adsWatched: newCount, adsRequired, unlocked: true });
      } else {
        setAdState({ ...adState, adsWatched: newCount });
      }
    } catch {
      setAdError("Connection error");
    } finally {
      setWatchingAd(false);
    }
  };

  const handleUnlock = async () => {
    if (!client || !isNumericId) return;
    setUnlocking(true);
    try {
      await fetch(`${API_BASE}/api/clients/${client.id}/datasets/${numericId}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "ads" }),
      });
      setIsAlreadyUnlocked(true);
    } catch { /* ignore */ }
    setUnlocking(false);
  };

  if (!currentDataset && !liveDataset) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Nav />
        <div className="flex flex-col items-center justify-center py-40">
          <Database className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">Dataset not found.</p>
          <Link href="/catalog" className="mt-4">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Catalog
            </Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const name = isNumericId ? (liveDataset?.name ?? `Dataset #${numericId}`) : (staticDataset?.name ?? "");
  const description = isNumericId ? (liveDataset?.description ?? "") : (staticDataset?.description ?? "");
  const category = isNumericId ? (liveDataset?.category ?? "") : (staticDataset?.category ?? "");
  const rawQuality = isNumericId ? (liveDataset?.qualityScore ?? 0) : 0;
  const accuracyLabel = rawQuality > 0 ? `${Number(rawQuality).toFixed(1)}%` : "In revisione";
  const samples = isNumericId ? (liveDataset?.recordCount?.toLocaleString() ?? "—") : (staticDataset?.samples ?? "—");
  const tags = isNumericId ? [category.toLowerCase()] : (staticDataset?.tags ?? []);
  const formats = isNumericId ? ["CSV", "JSON"] : (staticDataset?.formats ?? ["CSV"]);
  const schema = isNumericId ? [
    { field: "id", type: "integer", description: "Task identifier" },
    { field: "type", type: "enum", description: "text | image | classification" },
    { field: "question", type: "string", description: "Labeling question" },
    { field: "content", type: "string", description: "Content to be labeled" },
    { field: "final_label", type: "string", description: "Consensus label" },
    { field: "consensus_count", type: "integer", description: "Number of contributor votes" },
  ] : (staticDataset?.schema ?? []);

  const isPremium = tier === "PREMIUM";
  const adsDone = adState?.adsWatched ?? 0;
  const adsPct = adsRequired > 0 ? (adsDone / adsRequired) * 100 : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <section className="px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <Link href="/catalog">
              <Button variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground">
                <ArrowLeft className="h-4 w-4" /> Back to Catalog
              </Button>
            </Link>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{category}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${tierColor[tier]}`}>
                    {tier}
                  </Badge>
                </div>
                <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
              </div>
              <div className="flex items-center gap-3">
                {isPremium ? (
                  <Button disabled variant="outline" className="gap-2">
                    <Lock className="h-4 w-4" /> Contact Sales
                  </Button>
                ) : isAlreadyUnlocked ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => window.open(`/api/datasets/${numericId}/export?format=csv`, "_blank")}
                    >
                      <Download className="h-4 w-4" /> CSV
                    </Button>
                    <Button
                      className="gap-2"
                      onClick={() => window.open(`/api/datasets/${numericId}/export?format=json`, "_blank")}
                    >
                      <Download className="h-4 w-4" /> JSON
                    </Button>
                  </div>
                ) : adState ? null : (
                  <Button className="gap-2" onClick={handleStartUnlock}>
                    <Zap className="h-4 w-4" />
                    Unlock ({adsRequired} ads)
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <h2 className="font-semibold">About this dataset</h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {isNumericId ? description : (staticDataset?.longDescription ?? description)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <h2 className="font-semibold">Schema</h2>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">Field</th>
                          <th className="pb-2 pr-4 font-medium">Type</th>
                          <th className="pb-2 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schema.map((s, i) => (
                          <tr key={s.field} className={i < schema.length - 1 ? "border-b border-border" : ""}>
                            <td className="py-2 pr-4 font-mono text-xs text-primary">{s.field}</td>
                            <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{s.type}</td>
                            <td className="py-2 text-xs text-muted-foreground">{s.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Unlock flow */}
              {!isPremium && (
                <Card className={isAlreadyUnlocked ? "border-secondary/40 bg-secondary/5" : "border-primary/30 bg-primary/5"}>
                  <CardContent className="p-6">
                    {isAlreadyUnlocked ? (
                      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="font-semibold text-secondary flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5" /> Dataset Unlocked
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            You have full access. Download in CSV or JSON format.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {isNumericId && (
                            <>
                              <Button
                                variant="outline"
                                className="gap-2"
                                onClick={() => window.open(`/api/datasets/${numericId}/export?format=csv`, "_blank")}
                              >
                                <Download className="h-4 w-4" /> CSV
                              </Button>
                              <Button
                                className="gap-2"
                                onClick={() => window.open(`/api/datasets/${numericId}/export?format=json`, "_blank")}
                              >
                                <Download className="h-4 w-4" /> JSON
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : adState ? (
                      <div className="space-y-4">
                        <h3 className="font-semibold">
                          {adState.unlocked ? "🎉 Unlocked!" : `Watch ads to unlock (${adsDone}/${adsRequired})`}
                        </h3>
                        {!adState.unlocked && (
                          <>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${adsPct}%` }} />
                            </div>
                            {adError && (
                              <p className="text-xs text-destructive">{adError}</p>
                            )}
                            <Button className="gap-2" onClick={handleWatchAd} disabled={watchingAd || unlocking}>
                              {watchingAd ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Watching ad…</>
                              ) : (
                                <><Eye className="h-4 w-4" /> Watch Ad {adsDone + 1}/{adsRequired}</>
                              )}
                            </Button>
                          </>
                        )}
                        {adState.unlocked && (
                          <p className="text-sm text-muted-foreground">
                            Dataset unlocked! Go to your{" "}
                            <Link href="/dashboard" className="text-primary underline">dashboard</Link>{" "}
                            to download it.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="font-semibold">Ready to access this dataset?</h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Watch {adsRequired} interactive ad challenges to unlock, or subscribe to Business for unlimited access.
                          </p>
                        </div>
                        <Button className="shrink-0 gap-2" onClick={handleStartUnlock}>
                          <Zap className="h-4 w-4" /> Get Access
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-4">
              <Card className="border-border bg-card">
                <CardContent className="p-5 space-y-4">
                  {[
                    { icon: Database, label: "Samples", value: samples },
                    { icon: Star, label: "Accuracy", value: accuracyLabel },
                    { icon: Users, label: "Contributors", value: isNumericId ? "Crowd" : (staticDataset?.contributors ?? "—") },
                    { icon: Globe, label: "Languages", value: isNumericId ? "Multi" : (staticDataset?.languages?.join(", ") ?? "EN") },
                    { icon: FileText, label: "Formats", value: formats.join(", ") },
                    { icon: ShieldCheck, label: "Tier", value: tier },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                        <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="text-sm font-medium">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-5">
                  <h3 className="mb-3 text-sm font-semibold">Quality Guarantee</h3>
                  <ul className="space-y-2">
                    {[
                      "5+ crowd validators per sample",
                      "Controller consensus review",
                      "Admin final sign-off",
                      "Anti-bot challenge on every task",
                    ].map((q) => (
                      <li key={q} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        {q}
                      </li>
                    ))}
                  </ul>
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
