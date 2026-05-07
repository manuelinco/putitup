import { Router, type IRouter } from "express";
import { desc, gte } from "drizzle-orm";
import {
  db,
  usersTable,
  tasksTable,
  taskResponsesTable,
  datasetsTable,
  activityEventsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analytics/summary", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    [totalUsersResult],
    [activeUsersTodayResult],
    [totalTasksResult],
    [tasksCompletedTodayResult],
    [correctResponsesResult],
    [totalResponsesResult],
    [totalDatasetsResult],
    [totalDownloadsResult],
    [avgScoreResult],
    [adsServedResult],
    [tonPaidResult],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(usersTable),
    db.select({ count: sql<number>`count(*)::int` }).from(usersTable)
      .where(gte(usersTable.lastTaskAt, today)),
    db.select({ count: sql<number>`count(*)::int` }).from(tasksTable),
    db.select({ count: sql<number>`count(*)::int` }).from(taskResponsesTable)
      .where(gte(taskResponsesTable.createdAt, today)),
    db.select({ count: sql<number>`count(*)::int` }).from(taskResponsesTable)
      .where(sql`is_correct = true`),
    db.select({ count: sql<number>`count(*)::int` }).from(taskResponsesTable),
    db.select({ count: sql<number>`count(*)::int` }).from(datasetsTable),
    db.select({ sum: sql<number>`coalesce(sum(download_count), 0)::int` }).from(datasetsTable),
    db.select({ avg: sql<number>`coalesce(avg(score), 100)::float` }).from(usersTable),
    db.select({ sum: sql<number>`coalesce(sum(ads_watched_today), 0)::int` }).from(sql`ads_tracking`),
    db.select({ sum: sql<number>`coalesce(sum(amount_ton), 0)::float` }).from(sql`reward_ledger`),
  ]);

  const totalResponses = totalResponsesResult?.count ?? 0;
  const totalCorrect = correctResponsesResult?.count ?? 0;
  const averageAccuracy = totalResponses > 0 ? (totalCorrect / totalResponses) * 100 : 0;

  res.json({
    totalUsers: totalUsersResult?.count ?? 0,
    activeUsersToday: activeUsersTodayResult?.count ?? 0,
    totalTasks: totalTasksResult?.count ?? 0,
    tasksCompletedToday: tasksCompletedTodayResult?.count ?? 0,
    averageAccuracy: Math.round(averageAccuracy * 10) / 10,
    totalDatasets: totalDatasetsResult?.count ?? 0,
    totalDownloads: totalDownloadsResult?.sum ?? 0,
    platformQualityScore: Math.round((avgScoreResult?.avg ?? 100) * 10) / 10,
    adsServedToday: adsServedResult?.sum ?? 0,
    tonPaidOut: Math.round((tonPaidResult?.sum ?? 0) * 1000) / 1000,
  });
});

router.get("/analytics/activity", async (req, res): Promise<void> => {
  const parsed = GetRecentActivityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const events = await db
    .select()
    .from(activityEventsTable)
    .orderBy(desc(activityEventsTable.createdAt))
    .limit(parsed.data.limit ?? 20);

  res.json(events);
});

export default router;
