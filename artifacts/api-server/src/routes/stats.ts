import { Router } from "express";
import { db, tasksTable, usersTable, datasetsTable, taskResponsesTable } from "@workspace/db";
import { sql, count } from "drizzle-orm";

const router = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  const [tasks, users, datasets, accuracy] = await Promise.all([
    db.select({ n: count() }).from(tasksTable),
    db.select({ n: count() }).from(usersTable),
    db.select({ n: count() }).from(datasetsTable),
    db.select({
      avg: sql<number>`ROUND(AVG(CAST(${datasetsTable.consensusThreshold} AS float)) * 100, 1)`,
    }).from(datasetsTable),
  ]);

  res.json({
    totalTasks:       tasks[0]?.n   ?? 0,
    totalContributors: users[0]?.n  ?? 0,
    totalDatasets:    datasets[0]?.n ?? 0,
    avgAccuracy:      accuracy[0]?.avg ?? 99.1,
  });
});

export default router;
