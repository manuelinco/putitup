import { useState } from "react";
import { useGetLeaderboard } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Medal, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth";

const levelColors: Record<string, string> = {
  expert: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  pro: "text-primary border-primary/40 bg-primary/10",
  base: "text-muted-foreground border-border bg-muted/30",
};

const rankColors = ["text-yellow-400", "text-slate-300", "text-amber-600"];

type Period = "daily" | "weekly" | "allTime";

export default function Leaderboard() {
  const [period, setPeriod] = useState<Period>("allTime");
  const { data: entries, isLoading } = useGetLeaderboard({ period, limit: 50 });
  const { user: authUser } = useAuth();
  const currentUserId = authUser?.id;

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="text-center space-y-1 py-4">
          <h1 className="text-2xl font-black tracking-tight flex items-center justify-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-400" />
            Leaderboard
          </h1>
          <p className="text-xs text-muted-foreground">Top data labelers ranked by points</p>
        </div>

        {/* Period Filter */}
        <div className="flex gap-2">
          {(["daily", "weekly", "allTime"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                period === p
                  ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted"
              )}
            >
              {p === "allTime" ? "All Time" : p}
            </button>
          ))}
        </div>

        {/* Top 3 Podium */}
        {!isLoading && entries && entries.length >= 3 && (
          <div className="flex items-end justify-center gap-3 py-4">
            {/* 2nd */}
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="w-14 h-14 rounded-full bg-slate-300/20 border-2 border-slate-300/40 flex items-center justify-center text-xl font-black text-slate-300">
                {entries[1].username.charAt(0).toUpperCase()}
              </div>
              <span className="text-[10px] font-bold text-muted-foreground truncate max-w-[60px] text-center">{entries[1].username}</span>
              <div className="bg-slate-300/10 border border-slate-300/30 rounded-xl py-4 px-2 w-full text-center">
                <Medal className="w-4 h-4 text-slate-300 mx-auto mb-1" />
                <span className="text-xs font-bold">{entries[1].points.toLocaleString()}</span>
              </div>
            </div>
            {/* 1st */}
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="w-16 h-16 rounded-full bg-yellow-400/20 border-2 border-yellow-400/60 flex items-center justify-center text-2xl font-black text-yellow-400">
                {entries[0].username.charAt(0).toUpperCase()}
              </div>
              <span className="text-[10px] font-bold truncate max-w-[60px] text-center">{entries[0].username}</span>
              <div className="bg-yellow-400/10 border border-yellow-400/40 rounded-xl py-6 px-2 w-full text-center">
                <Trophy className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                <span className="text-xs font-bold">{entries[0].points.toLocaleString()}</span>
              </div>
            </div>
            {/* 3rd */}
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className="w-14 h-14 rounded-full bg-amber-600/20 border-2 border-amber-600/40 flex items-center justify-center text-xl font-black text-amber-600">
                {entries[2].username.charAt(0).toUpperCase()}
              </div>
              <span className="text-[10px] font-bold text-muted-foreground truncate max-w-[60px] text-center">{entries[2].username}</span>
              <div className="bg-amber-600/10 border border-amber-600/30 rounded-xl py-3 px-2 w-full text-center">
                <Star className="w-4 h-4 text-amber-600 mx-auto mb-1" />
                <span className="text-xs font-bold">{entries[2].points.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Full List */}
        <Card className="border-border/50 overflow-hidden">
          <CardHeader className="p-3 border-b border-border/30">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Full Rankings</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border/20">
            {isLoading
              ? Array(8).fill(0).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3">
                    <Skeleton className="w-6 h-4" />
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-2 w-16" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))
              : entries?.map((entry) => {
                  const isCurrentUser = entry.userId === currentUserId;
                  return (
                    <div
                      key={entry.userId}
                      className={cn(
                        "flex items-center gap-3 p-3 transition-colors",
                        isCurrentUser ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-muted/20"
                      )}
                    >
                      <span className={cn(
                        "w-6 text-center text-sm font-black",
                        entry.rank <= 3 ? rankColors[entry.rank - 1] : "text-muted-foreground"
                      )}>
                        {entry.rank <= 3 ? ["1st", "2nd", "3rd"][entry.rank - 1] : entry.rank}
                      </span>
                      <div className="w-10 h-10 rounded-full bg-muted border border-border/50 flex items-center justify-center font-bold text-sm text-primary">
                        {entry.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">
                          {entry.username}
                          {isCurrentUser && <span className="text-[10px] text-primary ml-1">(you)</span>}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className={cn("text-[9px] py-0 px-1.5", levelColors[entry.level])}>
                            {entry.level}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{entry.tasksCompleted} tasks</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-primary">{entry.points.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">{entry.score.toFixed(0)}% acc</p>
                      </div>
                    </div>
                  );
                })}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
