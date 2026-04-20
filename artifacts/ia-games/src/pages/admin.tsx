import { useState } from "react";
import {
  useGetAnalyticsSummary,
  useGetTaskStats,
  useListUsers,
  useCreateTask,
  useCreateDataset,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Users, Database, Target, TrendingUp, Plus, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Admin() {
  const { data: analytics, isLoading: analyticsLoading } = useGetAnalyticsSummary();
  const { data: taskStats } = useGetTaskStats();
  const { data: users } = useListUsers({ limit: 10 });
  const queryClient = useQueryClient();

  const createTask = useCreateTask();
  const createDataset = useCreateDataset();

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showDatasetForm, setShowDatasetForm] = useState(false);
  const [taskForm, setTaskForm] = useState({
    type: "text" as "image" | "text" | "classification",
    question: "",
    option1: "",
    option2: "",
    option3: "",
    option4: "",
    correctAnswer: "",
    difficulty: "easy" as "easy" | "medium" | "hard",
    pointsReward: 10,
  });
  const [datasetForm, setDatasetForm] = useState({
    name: "",
    description: "",
    category: "",
    accessType: "free" as "free" | "ads" | "premium",
    qualityScore: 90,
  });
  const [taskCreated, setTaskCreated] = useState(false);
  const [datasetCreated, setDatasetCreated] = useState(false);

  const handleCreateTask = async () => {
    const options = [taskForm.option1, taskForm.option2, taskForm.option3, taskForm.option4].filter(Boolean);
    await createTask.mutateAsync({
      data: {
        type: taskForm.type,
        dataPayload: {
          question: taskForm.question,
          options,
          text: taskForm.type === "text" ? taskForm.question : undefined,
        },
        correctAnswer: taskForm.correctAnswer || null,
        difficulty: taskForm.difficulty,
        pointsReward: taskForm.pointsReward,
        isGolden: !!taskForm.correctAnswer,
      },
    });
    setTaskCreated(true);
    setShowTaskForm(false);
    setTimeout(() => setTaskCreated(false), 3000);
  };

  const handleCreateDataset = async () => {
    await createDataset.mutateAsync({
      data: {
        name: datasetForm.name,
        description: datasetForm.description,
        category: datasetForm.category,
        accessType: datasetForm.accessType,
        qualityScore: datasetForm.qualityScore,
        tags: [],
      },
    });
    setDatasetCreated(true);
    setShowDatasetForm(false);
    setTimeout(() => setDatasetCreated(false), 3000);
  };

  return (
    <Layout>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 pt-2">
          <Settings className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-black">Admin Panel</h1>
        </div>

        {/* Analytics Overview */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" />
              Platform Analytics
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {analyticsLoading ? (
              <div className="grid grid-cols-2 gap-2">
                {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Total Users", value: analytics?.totalUsers.toLocaleString() },
                  { label: "Active Today", value: analytics?.activeUsersToday.toLocaleString() },
                  { label: "Total Tasks", value: analytics?.totalTasks.toLocaleString() },
                  { label: "Done Today", value: analytics?.tasksCompletedToday.toLocaleString() },
                  { label: "Avg Accuracy", value: `${analytics?.averageAccuracy?.toFixed(1)}%` },
                  { label: "TON Paid", value: `${analytics?.tonPaidOut?.toFixed(3)} TON` },
                  { label: "Total Datasets", value: analytics?.totalDatasets.toLocaleString() },
                  { label: "Downloads", value: analytics?.totalDownloads.toLocaleString() },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-card/50 rounded-lg p-2 text-center">
                    <p className="text-lg font-black">{value}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Task Stats */}
        {taskStats && (
          <Card className="border-border/50">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Target className="w-3.5 h-3.5" />
                Task Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Image", value: taskStats.byType.image },
                  { label: "Text", value: taskStats.byType.text },
                  { label: "Classify", value: taskStats.byType.classification },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-muted/30 rounded-lg p-2">
                    <p className="font-black text-lg">{value}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground text-center">
                {taskStats.goldenCount} golden tasks • {taskStats.completionRate.toFixed(1)}% completion rate
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create Task */}
        <Card className="border-secondary/30">
          <CardHeader className="p-3 pb-2 border-b border-border/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Plus className="w-3.5 h-3.5" />
                Create Task
              </CardTitle>
              {taskCreated && <Badge variant="outline" className="text-secondary border-secondary/40 text-[10px]"><CheckCircle className="w-3 h-3 mr-1" />Created!</Badge>}
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-2 space-y-2">
            {!showTaskForm ? (
              <Button size="sm" className="w-full text-xs" variant="outline" onClick={() => setShowTaskForm(true)}>
                <Plus className="w-3 h-3 mr-1" /> New Task
              </Button>
            ) : (
              <div className="space-y-2">
                <select
                  className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                  value={taskForm.type}
                  onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value as any })}
                >
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                  <option value="classification">Classification</option>
                </select>
                <input
                  className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground"
                  placeholder="Question / prompt"
                  value={taskForm.question}
                  onChange={(e) => setTaskForm({ ...taskForm, question: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  {["option1", "option2", "option3", "option4"].map((opt, i) => (
                    <input
                      key={opt}
                      className="p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground"
                      placeholder={`Option ${i + 1}`}
                      value={taskForm[opt as keyof typeof taskForm] as string}
                      onChange={(e) => setTaskForm({ ...taskForm, [opt]: e.target.value })}
                    />
                  ))}
                </div>
                <input
                  className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground"
                  placeholder="Correct answer (optional, for golden tasks)"
                  value={taskForm.correctAnswer}
                  onChange={(e) => setTaskForm({ ...taskForm, correctAnswer: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                    value={taskForm.difficulty}
                    onChange={(e) => setTaskForm({ ...taskForm, difficulty: e.target.value as any })}
                  >
                    <option value="easy">Easy (10pts)</option>
                    <option value="medium">Medium (20pts)</option>
                    <option value="hard">Hard (30pts)</option>
                  </select>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 text-xs" onClick={handleCreateTask} disabled={createTask.isPending || !taskForm.question}>
                      Create
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowTaskForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Dataset */}
        <Card className="border-accent/30">
          <CardHeader className="p-3 pb-2 border-b border-border/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Database className="w-3.5 h-3.5" />
                Create Dataset
              </CardTitle>
              {datasetCreated && <Badge variant="outline" className="text-secondary border-secondary/40 text-[10px]"><CheckCircle className="w-3 h-3 mr-1" />Created!</Badge>}
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-2 space-y-2">
            {!showDatasetForm ? (
              <Button size="sm" className="w-full text-xs" variant="outline" onClick={() => setShowDatasetForm(true)}>
                <Plus className="w-3 h-3 mr-1" /> New Dataset
              </Button>
            ) : (
              <div className="space-y-2">
                <input
                  className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground"
                  placeholder="Dataset name"
                  value={datasetForm.name}
                  onChange={(e) => setDatasetForm({ ...datasetForm, name: e.target.value })}
                />
                <textarea
                  className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground resize-none"
                  rows={2}
                  placeholder="Description"
                  value={datasetForm.description}
                  onChange={(e) => setDatasetForm({ ...datasetForm, description: e.target.value })}
                />
                <input
                  className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs placeholder:text-muted-foreground"
                  placeholder="Category (e.g., NLP, Computer Vision)"
                  value={datasetForm.category}
                  onChange={(e) => setDatasetForm({ ...datasetForm, category: e.target.value })}
                />
                <select
                  className="w-full p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
                  value={datasetForm.accessType}
                  onChange={(e) => setDatasetForm({ ...datasetForm, accessType: e.target.value as any })}
                >
                  <option value="free">Free</option>
                  <option value="ads">Unlock with Ads</option>
                  <option value="premium">Premium (Paid)</option>
                </select>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={handleCreateDataset}
                    disabled={createDataset.isPending || !datasetForm.name || !datasetForm.description}
                  >
                    Create Dataset
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowDatasetForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* User List */}
        <Card className="border-border/50">
          <CardHeader className="p-3 pb-2 border-b border-border/30">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Users className="w-3.5 h-3.5" />
              Recent Users
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border/20">
            {users?.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-bold">{user.username}</p>
                  <p className="text-[10px] text-muted-foreground">#{user.telegramId}</p>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className={cn("text-[9px]",
                    user.level === "expert" ? "text-yellow-400 border-yellow-400/40" :
                    user.level === "pro" ? "text-primary border-primary/40" :
                    "text-muted-foreground"
                  )}>
                    {user.level}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{user.points.toLocaleString()} pts</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
