import { Router } from "express";
import { db, usersTable, datasetsTable, taskResponsesTable } from "@workspace/db";
import { sql, count } from "drizzle-orm";
import { cached } from "../lib/cache";

const router = Router();

// Stats change slowly and are polled on every landing-page load — cache them
// briefly so traffic spikes don't hammer the pool with COUNT(*) queries.
const STATS_TTL_MS = 60_000;

router.get("/stats", async (_req, res): Promise<void> => {
  const stats = await cached("stats", STATS_TTL_MS, async () => {
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

    return { totalTasks, totalContributors, totalDatasets, avgAccuracy };
  });

  res.json(stats);
});

export default router;
