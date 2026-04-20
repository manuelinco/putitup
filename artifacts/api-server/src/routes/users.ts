import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, usersTable, taskResponsesTable, adsTrackingTable } from "@workspace/db";
import {
  ListUsersQueryParams,
  CreateUserBody,
  GetUserParams,
  UpdateUserParams,
  UpdateUserBody,
  GetUserStatsParams,
  GetUserByTelegramParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/users", async (req, res): Promise<void> => {
  const parsed = ListUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { level, limit, offset } = parsed.data;

  let query = db.select().from(usersTable).$dynamic();
  if (level) {
    query = query.where(eq(usersTable.level, level));
  }
  const users = await query
    .orderBy(desc(usersTable.points))
    .limit(limit ?? 20)
    .offset(offset ?? 0);

  res.json(users);
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, parsed.data.telegramId))
    .limit(1);

  if (existing.length > 0) {
    res.status(201).json(existing[0]);
    return;
  }

  const [user] = await db.insert(usersTable).values(parsed.data).returning();
  res.status(201).json(user);
});

router.get("/users/by-telegram/:telegramId", async (req, res): Promise<void> => {
  const params = GetUserByTelegramParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, params.data.telegramId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

router.get("/users/:id/stats", async (req, res): Promise<void> => {
  const params = GetUserStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const responses = await db
    .select()
    .from(taskResponsesTable)
    .where(eq(taskResponsesTable.userId, params.data.id));

  const tasksCompleted = responses.length;
  const tasksCorrect = responses.filter((r) => r.isCorrect === true).length;
  const accuracyRate = tasksCompleted > 0 ? (tasksCorrect / tasksCompleted) * 100 : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyTasksDone = responses.filter(
    (r) => r.createdAt >= today,
  ).length;

  const [adsRecord] = await db
    .select()
    .from(adsTrackingTable)
    .where(eq(adsTrackingTable.userId, params.data.id));

  res.json({
    userId: user.id,
    tasksCompleted,
    tasksCorrect,
    accuracyRate: Math.round(accuracyRate * 10) / 10,
    currentStreak: user.streak,
    energy: user.energy,
    maxEnergy: user.maxEnergy,
    xp: user.xp,
    level: user.level,
    points: user.points,
    adsWatchedToday: adsRecord?.adsWatchedToday ?? 0,
    dailyTasksDone,
  });
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

export default router;
