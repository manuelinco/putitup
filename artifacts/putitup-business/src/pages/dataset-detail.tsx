import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileText,
  Globe,
  Lock,
  ShieldCheck,
  Star,
  Users,
  Zap,
} from "lucide-react";

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

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>();
  const dataset = datasets[id ?? ""];

  if (!dataset) {
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
                  <Badge variant="secondary">{dataset.category}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${tierColor[dataset.tier]}`}>
                    {dataset.tier}
                  </Badge>
                </div>
                <h1 className="text-3xl font-bold tracking-tight">{dataset.name}</h1>
              </div>
              <div className="flex items-center gap-3">
                {dataset.tier === "PREMIUM" ? (
                  <Button disabled variant="outline" className="gap-2">
                    <Lock className="h-4 w-4" /> Contact Sales
                  </Button>
                ) : (
                  <Link href="/register">
                    <Button className="gap-2">
                      {dataset.adsRequired ? (
                        <>
                          <Zap className="h-4 w-4" />
                          Unlock ({dataset.adsRequired} ads)
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          Download
                        </>
                      )}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <h2 className="font-semibold">About this dataset</h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {dataset.longDescription}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {dataset.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        {t}
                      </Badge>
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
                        {dataset.schema.map((s, i) => (
                          <tr
                            key={s.field}
                            className={i < dataset.schema.length - 1 ? "border-b border-border" : ""}
                          >
                            <td className="py-2 pr-4 font-mono text-xs text-primary">
                              {s.field}
                            </td>
                            <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                              {s.type}
                            </td>
                            <td className="py-2 text-xs text-muted-foreground">
                              {s.description}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Unlock CTA */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-6">
                  <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold">Ready to access this dataset?</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {dataset.tier !== "PREMIUM"
                          ? `Watch ${dataset.adsRequired} interactive ad challenges to unlock, or subscribe to Business for unlimited access.`
                          : "Contact our sales team for enterprise licensing."}
                      </p>
                    </div>
                    <Link href="/register">
                      <Button className="shrink-0 gap-2">
                        <Zap className="h-4 w-4" /> Get Access
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <Card className="border-border bg-card">
                <CardContent className="p-5 space-y-4">
                  {[
                    { icon: Database, label: "Samples", value: dataset.samples },
                    {
                      icon: Star,
                      label: "Accuracy",
                      value: `${dataset.accuracy}%`,
                    },
                    { icon: Users, label: "Contributors", value: dataset.contributors },
                    {
                      icon: Globe,
                      label: "Languages",
                      value: dataset.languages.join(", "),
                    },
                    { icon: FileText, label: "Formats", value: dataset.formats.join(", ") },
                    { icon: ShieldCheck, label: "Last Updated", value: dataset.lastUpdated },
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
