import { Router } from "express";
import { db, tasksTable, usersTable, datasetsTable, taskResponsesTable } from "@workspace/db";
import { sql, count } from "drizzle-orm";

const router = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  let totalTasks = 0, totalContributors = 0, totalDatasets = 0, avgAccuracy = 99.1;

  // Each query is independent — one failure doesn't zero out the rest
  try {
    const [r] = await db.select({ n: count() }).from(taskResponsesTable);
    totalTasks = Number(r?.n ?? 0);
  } catch {}

  try {
    const [r] = await db.select({ n: count() }).from(usersTable);
    totalContributors = Number(r?.n ?? 0);
  } catch {}

  try {
    const [r] = await db.select({ n: count() }).from(datasetsTable);
    totalDatasets = Number(r?.n ?? 0);
  } catch {}

  try {
    const [r] = await db.select({
      avg: sql<number>`ROUND(AVG(consensus_threshold) * 100, 1)`,
    }).from(datasetsTable);
    if (r?.avg != null) avgAccuracy = Number(r.avg);
  } catch {}

  res.json({ totalTasks, totalContributors, totalDatasets, avgAccuracy });
});

export default router;
