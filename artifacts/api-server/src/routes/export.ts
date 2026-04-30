import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, datasetsTable, tasksTable, taskResponsesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/datasets/:id/export", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const format = String(req.query.format ?? "json").toLowerCase();
  const includeResponses = req.query.includeResponses === "true";

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

  let enrichedTasks = tasks as any[];

  if (includeResponses && tasks.length > 0) {
    const responses = await db
      .select()
      .from(taskResponsesTable)
      .where(eq(taskResponsesTable.taskId, tasks[0].id));
    enrichedTasks = tasks.map((t) => ({
      ...t,
      responses: responses.filter((r) => r.taskId === t.id),
    }));
  }

  const safeFilename = dataset.name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}_${id}.csv"`);

    const csvRows: string[] = [];
    csvRows.push(["id", "type", "question", "content", "correct_answer", "difficulty", "points_reward", "status", "final_label", "consensus_count"].join(","));

    for (const t of enrichedTasks) {
      const payload = t.dataPayload as any;
      const row = [
        t.id,
        t.type,
        `"${String(payload?.question ?? "").replace(/"/g, '""')}"`,
        `"${String(payload?.content ?? payload?.text ?? payload?.imageUrl ?? payload?.audioUrl ?? "").replace(/"/g, '""')}"`,
        `"${String(t.correctAnswer ?? "").replace(/"/g, '""')}"`,
        t.difficulty,
        t.pointsReward,
        t.status,
        `"${String(t.finalLabel ?? "").replace(/"/g, '""')}"`,
        t.consensusCount ?? 0,
      ].join(",");
      csvRows.push(row);
    }

    res.send(csvRows.join("\n"));
    return;
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}_${id}.json"`);

  res.json({
    dataset: {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      category: dataset.category,
      status: dataset.status,
      qualityScore: dataset.qualityScore,
      exportedAt: new Date().toISOString(),
    },
    totalTasks: enrichedTasks.length,
    tasks: enrichedTasks.map((t) => ({
      id: t.id,
      type: t.type,
      dataPayload: t.dataPayload,
      correctAnswer: t.correctAnswer,
      finalLabel: t.finalLabel,
      difficulty: t.difficulty,
      pointsReward: t.pointsReward,
      status: t.status,
      consensusCount: t.consensusCount,
      reviewStage: t.reviewStage,
    })),
  });
});

export default router;
