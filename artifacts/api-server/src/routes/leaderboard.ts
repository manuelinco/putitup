import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, usersTable, taskResponsesTable } from "@workspace/db";
import { GetLeaderboardQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/leaderboard", async (req, res): Promise<void> => {
  const parsed = GetLeaderboardQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit } = parsed.data;

  const users = await db
    .select()
    .from(usersTable)
    .orderBy(desc(usersTable.points))
    .limit(limit ?? 50);

  const entries = await Promise.all(
    users.map(async (user, index) => {
      const responses = await db
        .select()
        .from(taskResponsesTable)
        .where(eq(taskResponsesTable.userId, user.id));

      return {
        rank: index + 1,
        userId: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl ?? null,
        points: user.points,
        level: user.level,
        score: user.score,
        tasksCompleted: responses.length,
      };
    }),
  );

  res.json(entries);
});

export default router;
