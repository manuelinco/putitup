import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  taskResponsesTable,
  tasksTable,
  usersTable,
  activityEventsTable,
  datasetsTable,
} from "@workspace/db";
import {
  ListResponsesQueryParams,
  SubmitResponseBody,
  GetResponseParams,
} from "@workspace/api-zod";
import { generateVirtualTask } from "../lib/virtualTasks";

const VIRTUAL_TASK_BASE = 10_000_000_000;
const VIRTUAL_DATASET_SLOTS = 10_000_000; // datasetId * 10M + slot

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

  // Check duplicate BEFORE energy — avoids misleading "not enough energy" on re-submit
  const [existingResponse] = await db
    .select({ id: taskResponsesTable.id })
    .from(taskResponsesTable)
    .where(and(eq(taskResponsesTable.userId, userId), eq(taskResponsesTable.taskId, taskId)));

  if (existingResponse) {
    res.status(409).json({ error: "Task already submitted by this user" });
    return;
  }

  if (user.energy < MIN_ENERGY_PER_TASK) {
    res.status(400).json({ error: "Not enough energy" });
    return;
  }

  // ── Virtual task materialization ──────────────────────────────────────
  // If taskId is synthetic (> VIRTUAL_TASK_BASE), reconstruct the virtual
  // task content and insert a real DB row so consensus logic works normally.
  let resolvedTaskId = taskId;
  if (taskId > VIRTUAL_TASK_BASE) {
    const offset    = taskId - VIRTUAL_TASK_BASE;
    const datasetId = Math.floor(offset / VIRTUAL_DATASET_SLOTS);
    const slot      = offset % VIRTUAL_DATASET_SLOTS;
    const vtask     = generateVirtualTask(datasetId, slot);

    // Upsert: check if already materialized
    const [existing] = await db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(eq(tasksTable.id, taskId));

    if (!existing) {
      await db.insert(tasksTable).values({
        id:                 taskId,
        type:               vtask.type,
        dataPayload:        vtask.dataPayload as unknown as Record<string, unknown>,
        correctAnswer:      vtask.correctAnswer,
        difficulty:         vtask.difficulty,
        pointsReward:       vtask.pointsReward,
        isGolden:           vtask.isGolden,
        datasetId:          vtask.datasetId,
        requiredVotes:      vtask.requiredVotes,
        consensusThreshold: vtask.consensusThreshold,
        status:             "active",
        reviewStage:        "labeling",
        consensusCount:     0,
      });
    }
    resolvedTaskId = taskId;
  }

  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, resolvedTaskId));

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  let isCorrect: boolean;
  if (task.isGolden && task.correctAnswer != null) {
    isCorrect =
      answer.trim().toLowerCase() ===
      task.correctAnswer.trim().toLowerCase();
  } else {
    isCorrect = true;
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

  const taskResponses = await db
    .select()
    .from(taskResponsesTable)
    .where(eq(taskResponsesTable.taskId, taskId));

  const answerCounts = new Map<string, number>();
  for (const item of taskResponses) {
    const normalized = item.answer.trim().toLowerCase();
    answerCounts.set(normalized, (answerCounts.get(normalized) ?? 0) + 1);
  }

  const sortedAnswers = [...answerCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topAnswer = sortedAnswers[0];
  const totalVotes = taskResponses.length;
  const ratio = topAnswer && totalVotes > 0 ? topAnswer[1] / totalVotes : 0;
  const consensusReached = totalVotes >= task.requiredVotes && ratio >= task.consensusThreshold;

  let consensusUpdate: Partial<typeof tasksTable.$inferInsert> = {
    consensusCount: totalVotes,
  };

  if (consensusReached && task.reviewStage === "labeling") {
    let nextStatus = "pending_admin";
    let nextStage = "admin_review";
    let approvedAt: Date | null = null;
    let adminApprovedAt: Date | null = null;

    if (task.datasetId) {
      const [dataset] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, task.datasetId));
      if (dataset?.workflowMode === "consensus") {
        nextStatus = "approved";
        nextStage = "published";
        approvedAt = new Date();
        adminApprovedAt = approvedAt;
      } else if (dataset?.workflowMode === "supervisor_admin" || task.supervisorId) {
        nextStatus = "pending_supervisor";
        nextStage = "supervisor_review";
      }
    } else if (!task.supervisorId) {
      nextStatus = "approved";
      nextStage = "published";
      approvedAt = new Date();
      adminApprovedAt = approvedAt;
    }

    consensusUpdate = {
      ...consensusUpdate,
      finalLabel: topAnswer?.[0] ?? answer,
      status: nextStatus,
      reviewStage: nextStage,
      approvedAt,
      adminApprovedAt,
    };
  }

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

  const earnedPts = isCorrect ? pointsEarned + (accuracyBonus ? 5 : 0) : 0;
  const earnedXp = isCorrect ? xpEarned : 0;
  const finalXp = user.xp + earnedXp;
  const finalLevel = computeLevel(finalXp);
  const didLevelUp = finalLevel !== user.level;

  await db
    .update(usersTable)
    .set({
      points: user.points + earnedPts,
      xp: finalXp,
      level: finalLevel,
      streak: newStreak,
      score: Math.round(newScore * 10) / 10,
      energy: newEnergy,
      lastTaskAt: new Date(),
    })
    .where(eq(usersTable.id, userId));

  await db
    .update(tasksTable)
    .set(consensusUpdate)
    .where(eq(tasksTable.id, taskId));

  await db.insert(activityEventsTable).values({
    type: "task_completed",
    userId: user.id,
    username: user.username,
    description: `${user.username} completed a ${task.difficulty} ${task.type} task and earned ${earnedPts} pts`,
    metadata: { taskId, pointsEarned: earnedPts, xpEarned: earnedXp },
  });

  if (didLevelUp) {
    await db.insert(activityEventsTable).values({
      type: "level_up",
      userId: user.id,
      username: user.username,
      description: `${user.username} leveled up to ${finalLevel}!`,
      metadata: { newLevel: finalLevel },
    });
  }

  res.status(201).json({
    response,
    pointsEarned: earnedPts,
    xpEarned: earnedXp,
    accuracyBonus: isCorrect && accuracyBonus,
    newLevel: didLevelUp ? finalLevel : null,
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
