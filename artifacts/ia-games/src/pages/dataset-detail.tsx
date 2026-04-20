import { useGetDataset, useDownloadDataset, useWatchAd } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Star, Play, Lock, Database, ChevronLeft, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/contexts/auth";

export default function DatasetDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0", 10);
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const { data: dataset, isLoading } = useGetDataset(id, { query: { enabled: !!id } });
  const downloadDataset = useDownloadDataset();
  const watchAd = useWatchAd();
  const [adsWatched, setAdsWatched] = useState(0);
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = async (method: "free" | "ads" | "stripe") => {
    if (!dataset) return;
    await downloadDataset.mutateAsync({ id: dataset.id, data: { userId, paymentMethod: method } });
    setDownloaded(true);
  };

  const handleWatchAd = async () => {
    await watchAd.mutateAsync({ data: { userId, adType: "unlock", datasetId: dataset?.id } });
    setAdsWatched((p) => p + 1);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (!dataset) {
    return (
      <Layout>
        <div className="p-8 text-center space-y-3">
          <Database className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="font-bold">Dataset not found</p>
          <Link href="/datasets">
            <Button variant="outline" size="sm">Back to Datasets</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const adsNeeded = dataset.adsRequired ?? 3;
  const adsProgress = Math.min(adsWatched / adsNeeded, 1) * 100;
  const canDownloadWithAds = adsWatched >= adsNeeded;

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Back */}
        <Link href="/datasets">
          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
            Back to Datasets
          </button>
        </Link>

        {/* Dataset Header */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-black leading-tight">{dataset.name}</h1>
            <Badge variant="outline" className={cn(
              "text-[10px] flex-shrink-0",
              dataset.accessType === "free" ? "text-secondary border-secondary/40 bg-secondary/10" :
              dataset.accessType === "ads" ? "text-accent border-accent/40 bg-accent/10" :
              "text-primary border-primary/40 bg-primary/10"
            )}>
              {dataset.accessType === "free" ? "Free" : dataset.accessType === "ads" ? "Watch Ads" : "Premium"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{dataset.description}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-3 text-center">
              <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Quality</div>
              <div className="text-xl font-black text-secondary">{dataset.qualityScore}%</div>
              <Progress value={dataset.qualityScore} className="h-1 mt-1.5" />
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-3 text-center">
              <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Downloads</div>
              <div className="text-xl font-black text-primary">{dataset.downloadCount.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        {/* Details */}
        <Card className="border-border/50">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Dataset Info</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            {[
              { label: "Category", value: dataset.category },
              { label: "Records", value: dataset.recordCount ? dataset.recordCount.toLocaleString() : "N/A" },
              { label: "Size", value: dataset.size ?? "N/A" },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Tags */}
        {dataset.tags && dataset.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {dataset.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-1 rounded-md bg-muted/60 text-muted-foreground border border-border/40">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Download Action */}
        {downloaded ? (
          <Card className="border-secondary/40 bg-secondary/10">
            <CardContent className="p-4 flex items-center justify-center gap-3">
              <CheckCircle className="w-6 h-6 text-secondary" />
              <div>
                <p className="font-bold text-secondary">Downloaded!</p>
                <p className="text-xs text-muted-foreground">Dataset access granted</p>
              </div>
            </CardContent>
          </Card>
        ) : dataset.accessType === "free" ? (
          <Button className="w-full font-bold" onClick={() => handleDownload("free")} disabled={downloadDataset.isPending}>
            <Download className="w-4 h-4 mr-2" />
            Download Free
          </Button>
        ) : dataset.accessType === "ads" ? (
          <Card className="border-accent/40 bg-accent/5">
            <CardContent className="p-4 space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Ads watched</span>
                  <span className="font-bold text-accent">{adsWatched}/{adsNeeded}</span>
                </div>
                <Progress value={adsProgress} className="h-2" />
              </div>
              {canDownloadWithAds ? (
                <Button className="w-full font-bold" onClick={() => handleDownload("ads")} disabled={downloadDataset.isPending}>
                  <Download className="w-4 h-4 mr-2" />
                  Download Now
                </Button>
              ) : (
                <Button variant="outline" className="w-full font-bold border-accent/40 text-accent" onClick={handleWatchAd} disabled={watchAd.isPending}>
                  <Play className="w-4 h-4 mr-2" />
                  Watch Ad ({adsNeeded - adsWatched} more needed)
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-primary">Premium Access</span>
                <span className="text-2xl font-black">${dataset.price?.toFixed(2) ?? "49.99"}</span>
              </div>
              <Button className="w-full font-bold" onClick={() => handleDownload("stripe")} disabled={downloadDataset.isPending}>
                <Lock className="w-4 h-4 mr-2" />
                Purchase & Download
              </Button>
              <p className="text-[10px] text-center text-muted-foreground">Secure payment via Stripe</p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
