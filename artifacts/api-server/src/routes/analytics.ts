import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import {
  db,
  usersTable,
  tasksTable,
  taskResponsesTable,
  datasetsTable,
  adsTrackingTable,
  activityEventsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analytics/summary", async (_req, res): Promise<void> => {
  const [totalUsersResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allUsers = await db.select().from(usersTable);
  const activeUsersToday = allUsers.filter(
    (u) => u.lastTaskAt && u.lastTaskAt >= today,
  ).length;

  const [totalTasksResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasksTable);

  const allResponses = await db.select().from(taskResponsesTable);
  const tasksCompletedToday = allResponses.filter(
    (r) => r.createdAt >= today,
  ).length;

  const totalCorrect = allResponses.filter((r) => r.isCorrect === true).length;
  const averageAccuracy =
    allResponses.length > 0
      ? (totalCorrect / allResponses.length) * 100
      : 0;

  const [totalDatasetsResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(datasetsTable);

  const [totalDownloadsResult] = await db
    .select({ sum: sql<number>`coalesce(sum(download_count), 0)::int` })
    .from(datasetsTable);

  const avgScore =
    allUsers.length > 0
      ? allUsers.reduce((s, u) => s + u.score, 0) / allUsers.length
      : 0;

  const allAds = await db.select().from(adsTrackingTable);
  const adsServedToday = allAds.reduce(
    (s, a) => s + a.adsWatchedToday,
    0,
  );

  const totalPointsSpent = allUsers.reduce(
    (s, u) => s + (100000 - u.points),
    0,
  );
  const tonPaidOut = Math.max(0, totalPointsSpent * 0.001);

  res.json({
    totalUsers: totalUsersResult?.count ?? 0,
    activeUsersToday,
    totalTasks: totalTasksResult?.count ?? 0,
    tasksCompletedToday,
    averageAccuracy: Math.round(averageAccuracy * 10) / 10,
    totalDatasets: totalDatasetsResult?.count ?? 0,
    totalDownloads: totalDownloadsResult?.sum ?? 0,
    platformQualityScore: Math.round(avgScore * 10) / 10,
    adsServedToday,
    tonPaidOut: Math.round(tonPaidOut * 1000) / 1000,
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
