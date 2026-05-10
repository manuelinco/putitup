import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import {
  Database,
  Download,
  Lock,
  Search,
  SlidersHorizontal,
  Star,
} from "lucide-react";

type Tier = "BASIC" | "MEDIUM" | "PREMIUM";

interface Dataset {
  id: string;
  name: string;
  category: string;
  description: string;
  samples: string;
  languages: string[];
  tier: Tier;
  accuracy: number;
  adsRequired?: number;
  tags: string[];
}

const datasets: Dataset[] = [
  {
    id: "nlp-sentiment-01",
    name: "Multilingual Sentiment — v3",
    category: "NLP",
    description: "Sentence-level sentiment labels (positive/negative/neutral) across 12 languages, validated by 5 crowd members each.",
    samples: "120,000",
    languages: ["EN", "IT", "FR", "DE", "ES", "PT"],
    tier: "BASIC",
    accuracy: 98.7,
    adsRequired: 3,
    tags: ["sentiment", "classification", "multilingual"],
  },
  {
    id: "vision-bbox-02",
    name: "Urban Object Detection — v2",
    category: "Vision",
    description: "Bounding box annotations for 40 urban object classes. COCO-compatible format.",
    samples: "55,000",
    languages: ["EN"],
    tier: "MEDIUM",
    accuracy: 99.2,
    adsRequired: 5,
    tags: ["bounding-box", "object-detection", "urban"],
  },
  {
    id: "nlp-intent-03",
    name: "Customer Intent Classification",
    category: "NLP",
    description: "E-commerce intent labels: purchase, browse, return, support. Ideal for chatbot training.",
    samples: "85,000",
    languages: ["EN", "IT", "DE"],
    tier: "BASIC",
    accuracy: 97.4,
    adsRequired: 3,
    tags: ["intent", "chatbot", "e-commerce"],
  },
  {
    id: "nlp-rlhf-04",
    name: "RLHF Preference Pairs — EN",
    category: "NLP",
    description: "Human preference rankings for LLM response pairs. Used for RLHF fine-tuning pipelines.",
    samples: "45,000",
    languages: ["EN"],
    tier: "MEDIUM",
    accuracy: 99.5,
    adsRequired: 5,
    tags: ["rlhf", "preference", "llm"],
  },
  {
    id: "audio-asr-05",
    name: "Conversational ASR — IT/EN",
    category: "Audio",
    description: "Spontaneous speech transcriptions with speaker tags. 16kHz mono WAV, 2,100 hours.",
    samples: "2,100 hrs",
    languages: ["IT", "EN"],
    tier: "MEDIUM",
    accuracy: 98.1,
    adsRequired: 5,
    tags: ["asr", "speech", "transcription"],
  },
  {
    id: "nlp-ner-06",
    name: "Named Entity Recognition — EU",
    category: "NLP",
    description: "PER, ORG, LOC, DATE labels on news articles from 8 European countries.",
    samples: "210,000",
    languages: ["EN", "IT", "FR", "DE", "ES"],
    tier: "BASIC",
    accuracy: 98.9,
    adsRequired: 3,
    tags: ["ner", "news", "entities"],
  },
  {
    id: "vision-seg-07",
    name: "Medical Image Segmentation",
    category: "Vision",
    description: "Annotated X-ray and MRI scans with pixel-level masks for 12 anatomical structures.",
    samples: "18,000",
    languages: ["EN"],
    tier: "PREMIUM",
    accuracy: 99.8,
    tags: ["medical", "segmentation", "radiology"],
  },
  {
    id: "nlp-sft-08",
    name: "Instruction Following — Multilingual",
    category: "NLP",
    description: "SFT-ready instruction/response pairs for fine-tuning LLMs across 6 languages.",
    samples: "90,000",
    languages: ["EN", "IT", "FR", "DE", "ES", "PT"],
    tier: "MEDIUM",
    accuracy: 99.0,
    adsRequired: 5,
    tags: ["sft", "instruction", "fine-tuning"],
  },
];

const categories = ["All", "NLP", "Vision", "Audio"];
const tiers: (Tier | "All")[] = ["All", "BASIC", "MEDIUM", "PREMIUM"];

const tierColor: Record<Tier, string> = {
  BASIC: "bg-secondary/20 text-secondary border-secondary/30",
  MEDIUM: "bg-primary/20 text-primary border-primary/30",
  PREMIUM: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

export default function Catalog() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [tier, setTier] = useState<Tier | "All">("All");

  const filtered = datasets.filter((d) => {
    const matchQ =
      !query ||
      d.name.toLowerCase().includes(query.toLowerCase()) ||
      d.description.toLowerCase().includes(query.toLowerCase()) ||
      d.tags.some((t) => t.includes(query.toLowerCase()));
    const matchC = category === "All" || d.category === category;
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
              {datasets.length} datasets available — all human-labeled, multi-tier validated.
            </p>
          </div>

          {/* Filters */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search datasets..."
                className="pl-10"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={category === c ? "default" : "outline"}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </Button>
              ))}
              <div className="h-6 w-px bg-border mx-1" />
              {tiers.map((t) => (
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

          {/* Grid */}
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
                          <span className="ml-1 opacity-70">
                            · {d.adsRequired} ads
                          </span>
                        )}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        In revisione
                      </div>
                    </div>
                    <h3 className="mb-1 font-semibold leading-snug text-foreground">
                      {d.name}
                    </h3>
                    <Badge variant="secondary" className="mb-3 w-fit text-[10px]">
                      {d.category}
                    </Badge>
                    <p className="mb-4 flex-1 text-xs text-muted-foreground leading-relaxed">
                      {d.description}
                    </p>
                    <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Database className="h-3 w-3" />
                        {d.samples}
                      </div>
                      <div className="flex gap-1">
                        {d.languages.slice(0, 3).map((l) => (
                          <span key={l} className="rounded bg-muted px-1 py-0.5 text-[10px]">
                            {l}
                          </span>
                        ))}
                        {d.languages.length > 3 && (
                          <span className="rounded bg-muted px-1 py-0.5 text-[10px]">
                            +{d.languages.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {filtered.length === 0 && (
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
