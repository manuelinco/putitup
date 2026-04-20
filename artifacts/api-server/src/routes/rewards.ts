import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, adsTrackingTable, taskResponsesTable } from "@workspace/db";
import {
  ConvertPointsBody,
  GetDailyMissionsParams,
  RechargeEnergyBody,
} from "@workspace/api-zod";

const TON_PER_POINT = 0.001;
const MIN_PAYOUT = 1000;
const ENERGY_PER_RECHARGE = 50;

const router: IRouter = Router();

router.post("/rewards/convert", async (req, res): Promise<void> => {
  const parsed = ConvertPointsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId, points } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (points < MIN_PAYOUT) {
    res.json({
      success: false,
      pointsConverted: 0,
      tonAmount: 0,
      remainingPoints: user.points,
      message: `Minimum payout is ${MIN_PAYOUT} points`,
    });
    return;
  }

  if (user.points < points) {
    res.json({
      success: false,
      pointsConverted: 0,
      tonAmount: 0,
      remainingPoints: user.points,
      message: "Insufficient points",
    });
    return;
  }

  const tonAmount = points * TON_PER_POINT;
  const remainingPoints = user.points - points;

  await db
    .update(usersTable)
    .set({ points: remainingPoints })
    .where(eq(usersTable.id, userId));

  res.json({
    success: true,
    pointsConverted: points,
    tonAmount,
    remainingPoints,
    message: `Successfully converted ${points} pts to ${tonAmount} TON`,
  });
});

router.get("/rewards/missions/:userId", async (req, res): Promise<void> => {
  const params = GetDailyMissionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { userId } = params.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayResponses = await db
    .select()
    .from(taskResponsesTable)
    .where(eq(taskResponsesTable.userId, userId));

  const dailyDone = todayResponses.filter(
    (r) => r.createdAt >= today,
  ).length;

  const [adsRecord] = await db
    .select()
    .from(adsTrackingTable)
    .where(eq(adsTrackingTable.userId, userId));

  const missions = [
    {
      id: 1,
      title: "Task Warrior",
      description: "Complete 10 labeling tasks today",
      type: "tasks" as const,
      target: 10,
      current: Math.min(dailyDone, 10),
      reward: 100,
      completed: dailyDone >= 10,
      expiresAt: tomorrow.toISOString(),
    },
    {
      id: 2,
      title: "Accuracy Master",
      description: "Maintain 90%+ accuracy",
      type: "accuracy" as const,
      target: 90,
      current: Math.round(user.score),
      reward: 200,
      completed: user.score >= 90,
      expiresAt: tomorrow.toISOString(),
    },
    {
      id: 3,
      title: "Streak Keeper",
      description: "Maintain a 7-day streak",
      type: "streak" as const,
      target: 7,
      current: Math.min(user.streak, 7),
      reward: 300,
      completed: user.streak >= 7,
      expiresAt: tomorrow.toISOString(),
    },
    {
      id: 4,
      title: "Ad Viewer",
      description: "Watch 5 rewarded ads",
      type: "ads" as const,
      target: 5,
      current: Math.min(adsRecord?.adsWatchedToday ?? 0, 5),
      reward: 50,
      completed: (adsRecord?.adsWatchedToday ?? 0) >= 5,
      expiresAt: tomorrow.toISOString(),
    },
  ];

  res.json(missions);
});

router.post("/rewards/energy/recharge", async (req, res): Promise<void> => {
  const parsed = RechargeEnergyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId, method } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const newEnergy = Math.min(
    user.energy + ENERGY_PER_RECHARGE,
    user.maxEnergy,
  );

  await db
    .update(usersTable)
    .set({ energy: newEnergy })
    .where(eq(usersTable.id, userId));

  const allResponses = await db
    .select()
    .from(taskResponsesTable)
    .where(eq(usersTable.id, userId));

  const tasksCompleted = allResponses.length;
  const tasksCorrect = allResponses.filter((r) => r.isCorrect === true).length;
  const accuracyRate =
    tasksCompleted > 0 ? (tasksCorrect / tasksCompleted) * 100 : 0;
  const [adsRecord] = await db
    .select()
    .from(adsTrackingTable)
    .where(eq(adsTrackingTable.userId, userId));

  res.json({
    userId: user.id,
    tasksCompleted,
    tasksCorrect,
    accuracyRate: Math.round(accuracyRate * 10) / 10,
    currentStreak: user.streak,
    energy: newEnergy,
    maxEnergy: user.maxEnergy,
    xp: user.xp,
    level: user.level,
    points: user.points,
    adsWatchedToday: adsRecord?.adsWatchedToday ?? 0,
    dailyTasksDone: 0,
  });
});

export default router;
