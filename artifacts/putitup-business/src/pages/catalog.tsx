import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import { Database, Search, Star } from "lucide-react";
import { API_BASE } from "@/lib/api";

type Tier = "BASIC" | "MEDIUM" | "PREMIUM";

interface ApiDataset {
  id: number;
  name: string;
  category: string;
  description: string;
  tags: string[];
  accessType: string;
  adsRequired: number;
  requestedTaskCount: number;
  qualityScore: number;
  status: string;
  recordCount: number | null;
}

interface Dataset {
  id: number;
  name: string;
  category: string;
  normalizedCategory: string;
  description: string;
  tags: string[];
  tier: Tier;
  adsRequired: number;
  samples: string;
  accuracy: number | null;
}

const CATEGORY_MAP: Record<string, string> = {
  "NLP": "NLP",
  "Vision": "Vision",
  "Computer Vision": "Vision",
  "Audio": "Audio",
  "Audio NLP": "Audio",
  "Video Understanding": "Video",
  "Geospatial AI": "Other",
  "Medical AI": "Other",
  "Document AI": "Other",
};

function normCategory(cat: string): string {
  return CATEGORY_MAP[cat] ?? "Other";
}

function computeTier(accessType: string, adsRequired: number): Tier {
  if (accessType === "premium") return "PREMIUM";
  if (adsRequired >= 5) return "MEDIUM";
  return "BASIC";
}

function defaultAccuracy(tier: Tier): number {
  if (tier === "PREMIUM") return 99.8;
  if (tier === "MEDIUM") return 99.2;
  return 98.7;
}

function mapDataset(d: ApiDataset): Dataset {
  const tier = computeTier(d.accessType, d.adsRequired);
  return {
    id: d.id,
    name: d.name,
    category: d.category,
    normalizedCategory: normCategory(d.category),
    description: d.description,
    tags: d.tags ?? [],
    tier,
    adsRequired: d.adsRequired,
    samples: d.requestedTaskCount ? `${d.requestedTaskCount.toLocaleString()}` : "—",
    accuracy: d.qualityScore > 0 ? d.qualityScore : defaultAccuracy(tier),
  };
}

const tierColor: Record<Tier, string> = {
  BASIC: "bg-secondary/20 text-secondary border-secondary/30",
  MEDIUM: "bg-primary/20 text-primary border-primary/30",
  PREMIUM: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

const FILTER_CATEGORIES = ["All", "NLP", "Vision", "Audio", "Video", "Other"];
const FILTER_TIERS: (Tier | "All")[] = ["All", "BASIC", "MEDIUM", "PREMIUM"];

export default function Catalog() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [tier, setTier] = useState<Tier | "All">("All");

  useEffect(() => {
    fetch(`${API_BASE}/api/datasets`)
      .then((r) => r.json())
      .then((data: ApiDataset[]) => {
        if (Array.isArray(data)) {
          setDatasets(
            data
              .filter((d) => d.status === "active" && (d.requestedTaskCount ?? 0) > 0)
              .map(mapDataset)
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = datasets.filter((d) => {
    const q = query.toLowerCase();
    const matchQ =
      !query ||
      d.name.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.tags.some((t) => t.includes(q));
    const matchC = category === "All" || d.normalizedCategory === category;
    const matchT = tier === "All" || d.tier === tier;
    return matchQ && matchC && matchT;
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10">
            <Badge variant="outline" className="mb-3">Dataset Catalog</Badge>
            <h1 className="mb-2 text-4xl font-bold tracking-tight">Browse validated datasets</h1>
            <p className="text-muted-foreground">
              {loading ? "Loading…" : `${datasets.length} datasets available`} — all human-labeled, multi-tier validated.
            </p>
          </div>

          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search datasets…"
                className="pl-10"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTER_CATEGORIES.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={category === c ? "default" : "outline"}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </Button>
              ))}
              <div className="mx-1 h-6 w-px bg-border" />
              {FILTER_TIERS.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={tier === t ? "default" : "outline"}
                  onClick={() => setTier(t)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="h-52 border-border bg-card">
                  <CardContent className="p-5 space-y-3">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-12 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((d) => (
                <Link key={d.id} href={`/catalog/${d.id}`}>
                  <Card className="h-full cursor-pointer border-border bg-card hover-elevate transition-all hover:border-primary/50">
                    <CardContent className="flex h-full flex-col p-5">
                      <div className="mb-3 flex items-start justify-between">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${tierColor[d.tier]}`}
                        >
                          {d.tier}
                          {d.tier !== "PREMIUM" && (
                            <span className="ml-1 opacity-70">· {d.adsRequired} ads</span>
                          )}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {d.accuracy?.toFixed(1)}%
                        </div>
                      </div>
                      <h3 className="mb-1 font-semibold leading-snug text-foreground">
                        {d.name}
                      </h3>
                      <Badge variant="secondary" className="mb-3 w-fit text-[10px]">
                        {d.normalizedCategory}
                      </Badge>
                      <p className="mb-4 flex-1 text-xs text-muted-foreground leading-relaxed line-clamp-3">
                        {d.description}
                      </p>
                      <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Database className="h-3 w-3" />
                          {d.samples} tasks
                        </div>
                        <div className="flex gap-1">
                          {d.tags.slice(0, 2).map((t) => (
                            <span key={t} className="rounded bg-muted px-1 py-0.5 text-[10px]">
                              {t}
                            </span>
                          ))}
                          {d.tags.length > 2 && (
                            <span className="rounded bg-muted px-1 py-0.5 text-[10px]">
                              +{d.tags.length - 2}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="py-20 text-center text-muted-foreground">
              <Database className="mx-auto mb-4 h-12 w-12 opacity-30" />
              <p>No datasets match your search.</p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
