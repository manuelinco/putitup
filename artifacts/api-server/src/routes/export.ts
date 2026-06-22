import { Router, type IRouter } from "express";
import { eq, and, isNotNull } from "drizzle-orm";
import { db, datasetsTable, tasksTable, taskResponsesTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/datasets/:id/export", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const format = String(req.query.format ?? "json").toLowerCase();

  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid dataset ID" });
    return;
  }

  const [dataset] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, id));
  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.datasetId, id))
    .limit(100000);

  const safeFilename = dataset.name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}_${id}.csv"`);
    const csvRows: string[] = [
      ["id","type","question","content","correct_answer","difficulty","points_reward","status","final_label","consensus_count","review_stage"].join(","),
    ];
    for (const t of tasks) {
      const payload = t.dataPayload as any;
      csvRows.push([
        t.id, t.type,
        `"${String(payload?.question ?? "").replace(/"/g, '""')}"`,
        `"${String(payload?.content ?? payload?.text ?? payload?.imageUrl ?? payload?.audioUrl ?? "").replace(/"/g, '""')}"`,
        `"${String(t.correctAnswer ?? "").replace(/"/g, '""')}"`,
        t.difficulty, t.pointsReward, t.status,
        `"${String(t.finalLabel ?? "").replace(/"/g, '""')}"`,
        t.consensusCount ?? 0, t.reviewStage,
      ].join(","));
    }
    res.send(csvRows.join("\n"));
    return;
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}_${id}.json"`);
  res.json({
    dataset: { id: dataset.id, name: dataset.name, description: dataset.description, category: dataset.category, status: dataset.status, qualityScore: dataset.qualityScore, exportedAt: new Date().toISOString() },
    totalTasks: tasks.length,
    tasks: tasks.map((t) => ({
      id: t.id, type: t.type, dataPayload: t.dataPayload, correctAnswer: t.correctAnswer,
      finalLabel: t.finalLabel, difficulty: t.difficulty, pointsReward: t.pointsReward,
      status: t.status, consensusCount: t.consensusCount, reviewStage: t.reviewStage,
    })),
  });
});

router.get("/datasets/:id/minipimer", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const format = String(req.query.format ?? "jsonl").toLowerCase();

  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid dataset ID" });
    return;
  }

  const [dataset] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, id));
  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  const approvedTasks = await db
    .select()
    .from(tasksTable)
    .where(and(
      eq(tasksTable.datasetId, id),
      isNotNull(tasksTable.finalLabel),
    ))
    .limit(500000);

  if (approvedTasks.length === 0) {
    res.status(404).json({ error: "No approved tasks found for this dataset", dataset: dataset.name });
    return;
  }

  const taskIds = approvedTasks.map((t) => t.id);

  const allResponses = await db
    .select({
      id: taskResponsesTable.id,
      taskId: taskResponsesTable.taskId,
      userId: taskResponsesTable.userId,
      answer: taskResponsesTable.answer,
      isCorrect: taskResponsesTable.isCorrect,
      responseTimeMs: taskResponsesTable.responseTimeMs,
      createdAt: taskResponsesTable.createdAt,
    })
    .from(taskResponsesTable)
    .limit(2000000);

  const responsesByTask = new Map<number, typeof allResponses>();
  for (const r of allResponses) {
    if (!taskIds.includes(r.taskId)) continue;
    if (!responsesByTask.has(r.taskId)) responsesByTask.set(r.taskId, []);
    responsesByTask.get(r.taskId)!.push(r);
  }

  const safeFilename = dataset.name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();

  const records = approvedTasks.map((t) => {
    const payload = t.dataPayload as any;
    const responses = responsesByTask.get(t.id) ?? [];
    const answerCounts: Record<string, number> = {};
    for (const r of responses) {
      answerCounts[r.answer] = (answerCounts[r.answer] ?? 0) + 1;
    }
    return {
      task_id: t.id,
      dataset_id: id,
      dataset_name: dataset.name,
      type: t.type,
      question: payload?.question ?? null,
      content: payload?.content ?? payload?.text ?? payload?.imageUrl ?? payload?.audioUrl ?? null,
      options: payload?.options ?? null,
      final_label: t.finalLabel,
      consensus_count: t.consensusCount,
      difficulty: t.difficulty,
      review_stage: t.reviewStage,
      approved_at: t.adminApprovedAt ?? t.approvedAt ?? null,
      response_count: responses.length,
      answer_distribution: answerCounts,
      responses: responses.map((r) => ({
        answer: r.answer,
        is_correct: r.isCorrect,
        response_time_ms: r.responseTimeMs,
      })),
    };
  });

  if (format === "json") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="minipimer_${safeFilename}_${id}.json"`);
    res.json({
      minipimer_version: "1.0",
      dataset: { id: dataset.id, name: dataset.name, category: dataset.category, status: dataset.status },
      exported_at: new Date().toISOString(),
      total_records: records.length,
      records,
    });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Content-Disposition", `attachment; filename="minipimer_${safeFilename}_${id}.jsonl"`);
  const lines = records.map((r) => JSON.stringify(r)).join("\n");
  res.send(lines);
});

router.get("/datasets/minipimer/summary", async (req, res): Promise<void> => {
  const datasets = await db.select().from(datasetsTable).limit(100);
  const allApproved = await db
    .select({ datasetId: tasksTable.datasetId, id: tasksTable.id })
    .from(tasksTable)
    .where(isNotNull(tasksTable.finalLabel))
    .limit(500000);

  const countByDataset: Record<number, number> = {};
  for (const t of allApproved) {
    if (t.datasetId == null) continue;
    countByDataset[t.datasetId] = (countByDataset[t.datasetId] ?? 0) + 1;
  }

  const summary = datasets.map((ds) => ({
    id: ds.id,
    name: ds.name,
    category: ds.category,
    status: ds.status,
    approvedTasks: countByDataset[ds.id] ?? 0,
    totalTasks: ds.recordCount ?? 0,
    readyToExport: (countByDataset[ds.id] ?? 0) > 0,
  }));

  res.json(summary);
});

export default router;
