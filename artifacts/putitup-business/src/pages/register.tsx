import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  Zap,
} from "lucide-react";

const plans = [
  {
    id: "free",
    label: "Free",
    price: "€0/mo",
    description: "Up to 5 basic datasets/month — watch 5 ads per download",
    highlight: "No credit card",
  },
  {
    id: "starter",
    label: "Starter",
    price: "€9.99/mo",
    description: "Unlimited basic datasets, no ads",
  },
  {
    id: "business",
    label: "Business",
    price: "€19.99/mo",
    description: "Premium datasets + custom dataset requests",
    popular: true,
  },
  {
    id: "premium",
    label: "Premium",
    price: "Custom",
    description: "Enterprise: unlimited everything + priority support",
  },
];

export default function Register() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("free");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/clients/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Registration failed");
        return;
      }
      const client = data.client;
      localStorage.setItem("pb_client_id", String(client.id));
      localStorage.setItem("pb_client_email", client.email);
      localStorage.setItem("pb_client_name", `${client.firstName} ${client.lastName}`);
      localStorage.setItem("pb_client_company", client.company ?? "");
      window.dispatchEvent(new Event("storage"));
      setSuccess(true);
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch {
      setError("Connection error — please try again");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border bg-card text-center p-8">
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold">Account created!</h2>
          <p className="mt-2 text-sm text-muted-foreground">Redirecting to your dashboard…</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold tracking-tight">
          PUTITUP<span className="text-primary"> Business</span>
        </span>
      </Link>

      <Card className="w-full max-w-lg border-border bg-card">
        <CardHeader className="pb-4 text-center">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Access validated AI training datasets at scale
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {/* Plan selector */}
          <div className="mb-6">
            <p className="mb-3 text-sm font-medium text-foreground">Select a plan</p>
            <div className="grid grid-cols-2 gap-2">
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlan(p.id)}
                  className={`relative rounded-lg border p-3 text-left transition-colors ${
                    selectedPlan === p.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/30 hover:border-primary/50"
                  }`}
                >
                  {p.popular && (
                    <Badge className="absolute -top-2 right-1 text-[9px] px-1.5 py-0">
                      Popular
                    </Badge>
                  )}
                  {(p as any).highlight && (
                    <Badge variant="secondary" className="absolute -top-2 left-1 text-[9px] px-1.5 py-0">
                      {(p as any).highlight}
                    </Badge>
                  )}
                  <p className="text-xs font-semibold">{p.label}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-primary">{p.price}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight">
                    {p.description}
                  </p>
                </button>
              ))}
            </div>
            {selectedPlan === "free" && (
              <p className="mt-2 text-[11px] text-muted-foreground text-center bg-muted/30 rounded-lg py-1.5 px-3">
                ✅ Free plan: no credit card required — watch 5 ads to download each dataset (max 5/month)
              </p>
            )}
            {(selectedPlan === "business" || selectedPlan === "premium") && (
              <p className="mt-2 text-[11px] text-muted-foreground text-center bg-muted/30 rounded-lg py-1.5 px-3">
                ⭐ Includes custom dataset requests — our team will build datasets to your specifications
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="Jane Doe"
                    className="pl-10"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="company"
                    placeholder="Acme Corp"
                    className="pl-10"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !name || !email || password.length < 8}
            >
              {loading
                ? "Creating account…"
                : selectedPlan === "free"
                ? "Create Free Account"
                : `Start ${plans.find((p) => p.id === selectedPlan)?.label} Plan`}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
