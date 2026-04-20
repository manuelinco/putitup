import { useState } from "react";
import { useListDatasets, useGetDatasetCategories, useGetFeaturedDatasets } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Database, Download, Search, Filter, Lock, Play, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const accessConfig = {
  free: { label: "Free", icon: Star, color: "text-secondary border-secondary/40 bg-secondary/10" },
  ads: { label: "Watch Ads", icon: Play, color: "text-accent border-accent/40 bg-accent/10" },
  premium: { label: "Premium", icon: Lock, color: "text-primary border-primary/40 bg-primary/10" },
};

export default function Datasets() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedAccess, setSelectedAccess] = useState<"free" | "ads" | "premium" | undefined>();

  const { data: datasets, isLoading } = useListDatasets({
    search: search || undefined,
    category: selectedCategory,
    accessType: selectedAccess,
    limit: 30,
  });
  const { data: categories } = useGetDatasetCategories();
  const { data: featured } = useGetFeaturedDatasets();

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Datasets
            </h1>
            <p className="text-[11px] text-muted-foreground">High-quality labeled data</p>
          </div>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {datasets?.length ?? 0} datasets
          </Badge>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search datasets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-muted/40 border border-border/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:bg-muted/60 transition-all"
          />
        </div>

        {/* Access filter */}
        <div className="flex gap-2">
          {([undefined, "free", "ads", "premium"] as const).map((type) => (
            <button
              key={type ?? "all"}
              onClick={() => setSelectedAccess(type)}
              className={cn(
                "flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                selectedAccess === type
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted"
              )}
            >
              {type ?? "All"}
            </button>
          ))}
        </div>

        {/* Category chips */}
        {categories && categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setSelectedCategory(undefined)}
              className={cn(
                "flex-shrink-0 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all",
                !selectedCategory
                  ? "bg-primary/20 text-primary border border-primary/40"
                  : "bg-muted/40 text-muted-foreground border border-border/40"
              )}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.category}
                onClick={() => setSelectedCategory(cat.category === selectedCategory ? undefined : cat.category)}
                className={cn(
                  "flex-shrink-0 px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-all whitespace-nowrap",
                  selectedCategory === cat.category
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "bg-muted/40 text-muted-foreground border border-border/40"
                )}
              >
                {cat.category} ({cat.count})
              </button>
            ))}
          </div>
        )}

        {/* Dataset grid */}
        <div className="space-y-3">
          {isLoading
            ? Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)
            : datasets?.map((dataset) => {
                const access = accessConfig[dataset.accessType];
                const AccessIcon = access.icon;
                return (
                  <Link key={dataset.id} href={`/datasets/${dataset.id}`}>
                    <Card className="hover-elevate cursor-pointer border-border/50 bg-card/60 hover:border-primary/40 transition-all">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold truncate">{dataset.name}</h3>
                            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{dataset.description}</p>
                          </div>
                          <Badge variant="outline" className={cn("text-[9px] flex-shrink-0 flex items-center gap-1", access.color)}>
                            <AccessIcon className="w-2.5 h-2.5" />
                            {access.label}
                          </Badge>
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                            <span>Quality Score</span>
                            <span className="font-bold text-secondary">{dataset.qualityScore}%</span>
                          </div>
                          <Progress value={dataset.qualityScore} className="h-1.5" />
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex gap-3 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Download className="w-3 h-3" />
                              {dataset.downloadCount.toLocaleString()}
                            </span>
                            {dataset.recordCount && (
                              <span>{dataset.recordCount.toLocaleString()} records</span>
                            )}
                            {dataset.size && <span>{dataset.size}</span>}
                          </div>
                          <Badge variant="outline" className="text-[9px] text-muted-foreground">
                            {dataset.category}
                          </Badge>
                        </div>

                        {dataset.tags && dataset.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {dataset.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted/60 text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                            {dataset.tags.length > 3 && (
                              <span className="text-[9px] text-muted-foreground">+{dataset.tags.length - 3}</span>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
        </div>
      </div>
    </Layout>
  );
}
