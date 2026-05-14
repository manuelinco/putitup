import { Router, type IRouter } from "express";
import { eq, desc, or } from "drizzle-orm";
import { db, usersTable, taskResponsesTable, adsTrackingTable, rewardLedgerTable } from "@workspace/db";
import {
  ListUsersQueryParams,
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
  const { username, telegramId, walletAddress, avatarUrl } = req.body ?? {};

  if (!username || typeof username !== "string" || username.length < 3 || username.length > 20) {
    res.status(400).json({ error: "Username must be 3-20 characters" });
    return;
  }
  if (!telegramId && !walletAddress) {
    res.status(400).json({ error: "telegramId or walletAddress is required" });
    return;
  }

  // Check for existing user by telegramId or walletAddress
  const conditions = [];
  if (telegramId) conditions.push(eq(usersTable.telegramId, String(telegramId)));
  if (walletAddress) conditions.push(eq(usersTable.walletAddress, String(walletAddress)));

  if (conditions.length > 0) {
    const existing = await db
      .select()
      .from(usersTable)
      .where(or(...conditions))
      .limit(1);

    if (existing.length > 0) {
      res.status(201).json(existing[0]);
      return;
    }
  }

  const base = String(username).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4).padEnd(4, "X");
  const referralCode = `${base}${Math.floor(Math.random() * 9000 + 1000)}`;

  try {
    const [user] = await db.insert(usersTable).values({
      username: String(username),
      telegramId: telegramId ? String(telegramId) : null,
      walletAddress: walletAddress ? String(walletAddress) : null,
      avatarUrl: avatarUrl ? String(avatarUrl) : null,
      referralCode,
    }).returning();
    res.status(201).json(user);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    throw err;
  }
});

router.get("/users/check-username/:username", async (req, res): Promise<void> => {
  const { username } = req.params;
  if (!username || username.length < 3 || username.length > 20) {
    res.json({ available: false, reason: "Username must be 3-20 characters" });
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    res.json({ available: false, reason: "Only letters, numbers, underscores" });
    return;
  }
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username));
  res.json({ available: !existing });
});

router.get("/users/by-wallet/:walletAddress", async (req, res): Promise<void> => {
  const { walletAddress } = req.params;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.walletAddress, walletAddress));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
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

router.get("/users/:id/rewards", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const entries = await db
    .select()
    .from(rewardLedgerTable)
    .where(eq(rewardLedgerTable.userId, id))
    .orderBy(desc(rewardLedgerTable.createdAt))
    .limit(50);

  const totalTon = entries.reduce((sum, e) => sum + e.amountTon, 0);
  res.json({ entries, totalTon: Math.round(totalTon * 1e7) / 1e7 });
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
