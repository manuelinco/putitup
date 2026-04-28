import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import { Check, X, Zap } from "lucide-react";
import { useState } from "react";

const plans = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 9.99,
    yearlyPrice: 79,
    description: "Perfect for solo researchers and small teams evaluating data quality.",
    badge: null,
    features: [
      { label: "Access to BASIC datasets", included: true },
      { label: "Up to 3 datasets / month", included: true },
      { label: "Unlock via ad challenges (3 ads)", included: true },
      { label: "CSV & JSONL export", included: true },
      { label: "Quality reports per dataset", included: true },
      { label: "MEDIUM datasets", included: false },
      { label: "API access", included: false },
      { label: "Priority queue", included: false },
      { label: "Dedicated account manager", included: false },
    ],
  },
  {
    id: "business",
    name: "Business",
    monthlyPrice: 19.99,
    yearlyPrice: 120,
    description: "For growing teams that need unlimited access and faster turnaround.",
    badge: "Most Popular",
    features: [
      { label: "Access to BASIC datasets", included: true },
      { label: "Access to MEDIUM datasets", included: true },
      { label: "Unlimited datasets / month", included: true },
      { label: "No ad challenges required", included: true },
      { label: "CSV, JSONL, Parquet export", included: true },
      { label: "Full quality & audit reports", included: true },
      { label: "REST API access", included: true },
      { label: "Priority task queue", included: false },
      { label: "Dedicated account manager", included: false },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    monthlyPrice: null,
    yearlyPrice: null,
    description: "Enterprise-grade SLA with custom dataset creation on demand.",
    badge: "Custom",
    features: [
      { label: "Everything in Business", included: true },
      { label: "Custom dataset creation", included: true },
      { label: "Dedicated priority queue", included: true },
      { label: "SLA-backed delivery", included: true },
      { label: "Dedicated account manager", included: true },
      { label: "SSO & team management", included: true },
      { label: "On-premise export", included: true },
      { label: "Legal data agreements", included: true },
      { label: "24/7 priority support", included: true },
    ],
  },
];

export default function Pricing() {
  const [yearly, setYearly] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      <section className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 text-center">
            <Badge variant="outline" className="mb-4">Pricing</Badge>
            <h1 className="mb-4 text-5xl font-bold tracking-tight">
              Simple, transparent pricing
            </h1>
            <p className="mb-8 text-muted-foreground">
              Unlock validated AI training datasets — no surprises, no hidden fees.
            </p>

            <div className="inline-flex items-center gap-3 rounded-full border border-border bg-card p-1">
              <button
                onClick={() => setYearly(false)}
                className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                  !yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setYearly(true)}
                className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                  yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Yearly
                <Badge variant="secondary" className="text-[10px]">Save 40%</Badge>
              </button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={`relative flex flex-col border-border bg-card ${
                  plan.badge === "Most Popular"
                    ? "border-primary ring-1 ring-primary"
                    : ""
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className={plan.badge === "Most Popular" ? "bg-primary" : ""}>
                      {plan.badge === "Most Popular" && <Zap className="mr-1 h-3 w-3" />}
                      {plan.badge}
                    </Badge>
                  </div>
                )}
                <CardHeader className="pb-4 pt-8">
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                  <div className="mt-4">
                    {plan.monthlyPrice !== null ? (
                      <div className="flex items-end gap-1">
                        <span className="text-4xl font-bold">
                          €{yearly ? plan.yearlyPrice : plan.monthlyPrice}
                        </span>
                        <span className="mb-1 text-muted-foreground">
                          /{yearly ? "yr" : "mo"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-end gap-1">
                        <span className="text-4xl font-bold">Custom</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-6">
                  <ul className="flex flex-col gap-3">
                    {plan.features.map((f) => (
                      <li key={f.label} className="flex items-start gap-3 text-sm">
                        {f.included ? (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                        )}
                        <span className={f.included ? "text-foreground" : "text-muted-foreground/40"}>
                          {f.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto">
                    {plan.id === "premium" ? (
                      <Button variant="outline" className="w-full" disabled>
                        Contact Sales
                      </Button>
                    ) : (
                      <Link href="/register">
                        <Button
                          className="w-full"
                          variant={plan.badge === "Most Popular" ? "default" : "outline"}
                        >
                          Get Started
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-16 rounded-xl border border-border bg-card p-8 text-center">
            <h3 className="mb-2 text-xl font-semibold">Need a custom dataset?</h3>
            <p className="mb-6 text-muted-foreground">
              Tell us what you need — domain, language, task type, volume — and our team
              will design a labeling pipeline and deliver a dataset to your exact specs.
            </p>
            <Button variant="outline" size="lg" disabled>
              Request Custom Dataset
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">Custom orders coming soon</p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
