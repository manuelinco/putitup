import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  taskResponsesTable,
  tasksTable,
  usersTable,
  activityEventsTable,
} from "@workspace/db";
import {
  ListResponsesQueryParams,
  SubmitResponseBody,
  GetResponseParams,
} from "@workspace/api-zod";

const XP_PER_TASK = 10;
const XP_PER_LEVEL = 500;
const ACCURACY_BONUS_THRESHOLD = 90;
const MIN_ENERGY_PER_TASK = 5;

const computeLevel = (
  xp: number,
): "base" | "pro" | "expert" => {
  if (xp >= XP_PER_LEVEL * 3) return "expert";
  if (xp >= XP_PER_LEVEL) return "pro";
  return "base";
};

const router: IRouter = Router();

router.get("/responses", async (req, res): Promise<void> => {
  const parsed = ListResponsesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { userId, taskId, limit, offset } = parsed.data;

  let query = db.select().from(taskResponsesTable).$dynamic();
  const conditions = [];
  if (userId) conditions.push(eq(taskResponsesTable.userId, userId));
  if (taskId) conditions.push(eq(taskResponsesTable.taskId, taskId));
  if (conditions.length > 0) query = query.where(and(...conditions));

  const responses = await query.limit(limit ?? 20).offset(offset ?? 0);
  res.json(responses);
});

router.post("/responses", async (req, res): Promise<void> => {
  const parsed = SubmitResponseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId, taskId, answer, responseTimeMs } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.energy < MIN_ENERGY_PER_TASK) {
    res.status(400).json({ error: "Not enough energy" });
    return;
  }

  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, taskId));

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  let isCorrect: boolean | null = null;
  if (task.correctAnswer != null) {
    isCorrect =
      answer.trim().toLowerCase() ===
      task.correctAnswer.trim().toLowerCase();
  }

  const basePts = task.pointsReward;
  const difficultyMultiplier =
    task.difficulty === "hard" ? 3 : task.difficulty === "medium" ? 2 : 1;
  const pointsEarned = basePts * difficultyMultiplier;
  const xpEarned = XP_PER_TASK * difficultyMultiplier;

  const [response] = await db
    .insert(taskResponsesTable)
    .values({
      userId,
      taskId,
      answer,
      isCorrect,
      responseTimeMs,
      pointsEarned,
    })
    .returning();

  const newXp = user.xp + xpEarned;
  const newLevel = computeLevel(newXp);
  const leveledUp = newLevel !== user.level;
  const newStreak = user.streak + 1;
  const newEnergy = Math.max(0, user.energy - MIN_ENERGY_PER_TASK);

  const allResponses = await db
    .select()
    .from(taskResponsesTable)
    .where(eq(taskResponsesTable.userId, userId));

  const totalResponses = allResponses.length;
  const correctResponses = allResponses.filter(
    (r) => r.isCorrect === true,
  ).length;
  const newScore =
    totalResponses > 0
      ? (correctResponses / totalResponses) * 100
      : user.score;

  const accuracyBonus = newScore >= ACCURACY_BONUS_THRESHOLD;

  await db
    .update(usersTable)
    .set({
      points: user.points + pointsEarned + (accuracyBonus ? 5 : 0),
      xp: newXp,
      level: newLevel,
      streak: newStreak,
      score: Math.round(newScore * 10) / 10,
      energy: newEnergy,
      lastTaskAt: new Date(),
    })
    .where(eq(usersTable.id, userId));

  await db
    .update(tasksTable)
    .set({
      consensusCount: task.consensusCount + 1,
    })
    .where(eq(tasksTable.id, taskId));

  await db.insert(activityEventsTable).values({
    type: "task_completed",
    userId: user.id,
    username: user.username,
    description: `${user.username} completed a ${task.difficulty} ${task.type} task and earned ${pointsEarned} pts`,
    metadata: { taskId, pointsEarned, xpEarned },
  });

  if (leveledUp) {
    await db.insert(activityEventsTable).values({
      type: "level_up",
      userId: user.id,
      username: user.username,
      description: `${user.username} leveled up to ${newLevel}!`,
      metadata: { newLevel },
    });
  }

  res.status(201).json({
    response,
    pointsEarned: pointsEarned + (accuracyBonus ? 5 : 0),
    xpEarned,
    accuracyBonus,
    newLevel: leveledUp ? newLevel : null,
    streakBonus: newStreak > 0 && newStreak % 7 === 0,
  });
});

router.get("/responses/:id", async (req, res): Promise<void> => {
  const params = GetResponseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [response] = await db
    .select()
    .from(taskResponsesTable)
    .where(eq(taskResponsesTable.id, params.data.id));

  if (!response) {
    res.status(404).json({ error: "Response not found" });
    return;
  }

  res.json(response);
});

export default router;
