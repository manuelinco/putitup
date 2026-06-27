import { Router, type IRouter } from "express";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, usersTable, taskResponsesTable } from "@workspace/db";
import { GetLeaderboardQueryParams } from "@workspace/api-zod";
import { cached } from "../lib/cache";

const router: IRouter = Router();

// Short cache window: leaderboards tolerate small staleness and are read by
// many clients, so caching collapses bursts into a single DB round-trip.
const LEADERBOARD_TTL_MS = 30_000;

router.get("/leaderboard", async (req, res): Promise<void> => {
  const parsed = GetLeaderboardQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const limit = parsed.data.limit ?? 50;

  const entries = await cached(`leaderboard:${limit}`, LEADERBOARD_TTL_MS, async () => {
    // 1 query: top-N users by points.
    const users = await db
      .select()
      .from(usersTable)
      .orderBy(desc(usersTable.points))
      .limit(limit);

    // 1 query: aggregate response counts for just those users (was N+1).
    const ids = users.map((u) => u.id);
    const counts = ids.length
      ? await db
          .select({
            userId: taskResponsesTable.userId,
            n: sql<number>`count(*)`,
          })
          .from(taskResponsesTable)
          .where(inArray(taskResponsesTable.userId, ids))
          .groupBy(taskResponsesTable.userId)
      : [];

    const countByUser = new Map(counts.map((c) => [c.userId, Number(c.n)]));

    return users.map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl ?? null,
      points: user.points,
      level: user.level,
      score: user.score,
      tasksCompleted: countByUser.get(user.id) ?? 0,
    }));
  });

  res.json(entries);
});

export default router;
