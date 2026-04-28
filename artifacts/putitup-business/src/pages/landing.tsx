import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  Globe,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";

const stats = [
  { label: "Validated Tasks", value: "2.4M+" },
  { label: "Active Contributors", value: "18K+" },
  { label: "Dataset Categories", value: "34" },
  { label: "Avg. Accuracy", value: "99.1%" },
];

const features = [
  {
    icon: Users,
    title: "Crowd-Powered Validation",
    description:
      "Every data point is validated through a 3-level consensus pipeline: crowd contributors, controllers, and admin reviewers.",
  },
  {
    icon: ShieldCheck,
    title: "Anti-Bot Guarantee",
    description:
      "Interactive challenge system during task completion ensures real human responses — no bots, no low-quality shortcuts.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Quality Metrics",
    description:
      "Monitor accuracy, consensus rate, and contributor reliability live. Every dataset ships with a full quality report.",
  },
  {
    icon: Globe,
    title: "Multilingual Coverage",
    description:
      "Datasets available across 20+ languages. Native speakers complete tasks to ensure cultural accuracy and context.",
  },
  {
    icon: Database,
    title: "Structured Export Formats",
    description:
      "Download in CSV, JSONL, Parquet, or directly integrate via API. Ready for immediate use in your training pipeline.",
  },
  {
    icon: Zap,
    title: "On-Demand Acceleration",
    description:
      "Need more data fast? Upgrade your plan to increase task priority and get larger datasets in hours, not weeks.",
  },
];

const useCases = [
  {
    tag: "NLP",
    title: "Text Classification",
    description: "Sentiment, intent, topic — labeled by humans for high fidelity.",
    count: "320K+ samples",
  },
  {
    tag: "Vision",
    title: "Image Annotation",
    description: "Bounding boxes, segmentation masks, object detection sets.",
    count: "890K+ images",
  },
  {
    tag: "Audio",
    title: "Speech & Transcription",
    description: "ASR training data with speaker diarization labels.",
    count: "4,200 hrs",
  },
  {
    tag: "NLP",
    title: "Instruction Tuning",
    description: "RLHF preference pairs and SFT instruction datasets.",
    count: "150K+ pairs",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-24 pt-20">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[600px] w-[600px] rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-4xl text-center">
          <Badge className="mb-6 gap-1.5 px-3 py-1 text-xs">
            <Zap className="h-3 w-3" />
            Human-in-the-loop AI Data Platform
          </Badge>
          <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            Train smarter AI with{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              human-validated
            </span>{" "}
            data
          </h1>
          <p className="mb-10 mx-auto max-w-2xl text-lg text-muted-foreground">
            PUTITUP delivers enterprise-grade training datasets validated by thousands of
            real human contributors through a rigorous 3-tier quality pipeline. No bots.
            No noise. Just clean, labeled data.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/register">
              <Button size="lg" className="gap-2 px-8">
                Start for Free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/catalog">
              <Button size="lg" variant="outline" className="gap-2 px-8">
                Browse Datasets
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-border lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="px-8 py-10 text-center">
              <p className="text-3xl font-bold text-primary">{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <Badge variant="outline" className="mb-4">Platform Features</Badge>
            <h2 className="text-4xl font-bold tracking-tight">
              Why enterprises choose PUTITUP
            </h2>
            <p className="mt-4 text-muted-foreground">
              A complete data platform built around trust and transparency.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="bg-card border-border hover-elevate transition-all">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mb-2 font-semibold text-foreground">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="bg-card px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <Badge variant="outline" className="mb-4">Dataset Catalog</Badge>
            <h2 className="text-4xl font-bold tracking-tight">
              Data for every AI domain
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {useCases.map((u) => (
              <Card key={u.title} className="border-border bg-background hover-elevate">
                <CardContent className="p-6">
                  <Badge variant="secondary" className="mb-4 text-xs">{u.tag}</Badge>
                  <h3 className="mb-2 font-semibold">{u.title}</h3>
                  <p className="mb-4 text-sm text-muted-foreground">{u.description}</p>
                  <p className="text-xs font-medium text-primary">{u.count}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/catalog">
              <Button variant="outline" size="lg" className="gap-2">
                View Full Catalog <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <Badge variant="outline" className="mb-4">How It Works</Badge>
            <h2 className="text-4xl font-bold tracking-tight">
              3-tier validation pipeline
            </h2>
          </div>
          <div className="relative grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Crowd Contributors",
                desc: "Tasks are distributed to thousands of vetted contributors via the PUTITUP Telegram Mini App. Anti-bot challenges ensure authenticity.",
              },
              {
                step: "02",
                title: "Controller Review",
                desc: "Trained controllers analyze crowd consensus. Outliers are flagged, edge cases resolved, and quality scores assigned.",
              },
              {
                step: "03",
                title: "Admin Approval",
                desc: "Senior admins perform final review on batches before sealing datasets for delivery. 99%+ accuracy guaranteed.",
              },
            ].map((item, i) => (
              <div key={item.step} className="relative">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-lg font-bold text-primary">
                  {item.step}
                </div>
                <h3 className="mb-2 font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
                {i < 2 && (
                  <div className="absolute right-0 top-6 hidden -translate-y-1/2 text-muted-foreground sm:block">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-primary/20 to-accent/10 px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight">
            Ready to build better AI?
          </h2>
          <p className="mb-8 text-muted-foreground">
            Join hundreds of enterprises already using PUTITUP to power their training
            pipelines. Start with a free plan — no credit card required.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/register">
              <Button size="lg" className="gap-2 px-8">
                Create Free Account <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="px-8">
                View Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
