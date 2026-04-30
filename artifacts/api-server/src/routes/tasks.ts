import { Router, type IRouter } from "express";
import { eq, and, notInArray, desc } from "drizzle-orm";
import { db, tasksTable, taskResponsesTable, rewardLedgerTable, usersTable } from "@workspace/db";
import {
  ListTasksQueryParams,
  CreateTaskBody,
  GetTaskParams,
  GetNextTaskQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tasks/stats", async (_req, res): Promise<void> => {
  const tasks = await db.select().from(tasksTable);
  const total = tasks.length;
  const responses = await db.select().from(taskResponsesTable);

  const byType = { image: 0, text: 0, classification: 0 };
  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  let goldenCount = 0;

  for (const t of tasks) {
    byType[t.type]++;
    byDifficulty[t.difficulty]++;
    if (t.isGolden) goldenCount++;
  }

  const completionRate =
    total > 0 ? Math.min((responses.length / (total * 3)) * 100, 100) : 0;

  res.json({
    total,
    byType,
    byDifficulty,
    goldenCount,
    completionRate: Math.round(completionRate * 10) / 10,
  });
});

const DATASET_OPTIONS: Record<number, string[]> = {
  10: ["positive", "negative", "neutral"],
  11: ["purchase", "browse", "return", "complaint", "inquiry"],
  12: ["vehicle", "person", "building", "animal", "nature"],
  13: ["PER", "ORG", "LOC", "DATE", "MISC"],
  14: ["A1", "A2", "Both good", "Both poor"],
  15: ["correct", "minor errors", "major errors", "completely wrong"],
  16: ["cardiology", "neurology", "oncology", "emergency", "general"],
  17: ["complaint", "question", "return", "compliment", "billing"],
  18: ["enthusiastic", "negative", "neutral", "sarcastic"],
  19: ["excellent", "good", "fair", "low"],
};

function enrichTask(task: typeof tasksTable.$inferSelect) {
  const payload = (task.dataPayload ?? {}) as Record<string, unknown>;
  if (!payload.options && task.datasetId && DATASET_OPTIONS[task.datasetId]) {
    return {
      ...task,
      dataPayload: { ...payload, options: DATASET_OPTIONS[task.datasetId] },
    };
  }
  return task;
}

router.get("/tasks/next", async (req, res): Promise<void> => {
  const parsed = GetNextTaskQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId } = parsed.data;

  const answeredIds = await db
    .select({ taskId: taskResponsesTable.taskId })
    .from(taskResponsesTable)
    .where(eq(taskResponsesTable.userId, userId));

  const answeredTaskIds = answeredIds.map((r) => r.taskId);

  let task;
  if (answeredTaskIds.length > 0) {
    const [t] = await db
      .select()
      .from(tasksTable)
      .where(and(notInArray(tasksTable.id, answeredTaskIds), eq(tasksTable.status, "active")))
      .limit(1);
    task = t;
  } else {
    const [t] = await db.select().from(tasksTable).where(eq(tasksTable.status, "active")).limit(1);
    task = t;
  }

  if (!task) {
    res.status(404).json({ error: "No tasks available" });
    return;
  }

  res.json(enrichTask(task));
});

router.get("/tasks", async (req, res): Promise<void> => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { type, difficulty, limit, offset } = parsed.data;

  let query = db.select().from(tasksTable).$dynamic();
  const conditions = [];
  if (type) conditions.push(eq(tasksTable.type, type));
  if (difficulty) conditions.push(eq(tasksTable.difficulty, difficulty));
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const tasks = await query.limit(limit ?? 10).offset(offset ?? 0);
  res.json(tasks);
});

router.post("/tasks", async (req, res): Promise<void> => {
  const {
    type,
    dataPayload,
    correctAnswer,
    difficulty = "easy",
    pointsReward = 10,
    isGolden = false,
    datasetId = null,
    requiredVotes = 3,
    consensusThreshold = 0.8,
    supervisorId = null,
  } = req.body ?? {};

  if (!type || !dataPayload) {
    res.status(400).json({ error: "type and dataPayload are required" });
    return;
  }

  const [task] = await db.insert(tasksTable).values({
    type,
    dataPayload,
    correctAnswer: correctAnswer ?? null,
    difficulty,
    pointsReward: Number(pointsReward),
    isGolden: Boolean(isGolden),
    datasetId: datasetId ? Number(datasetId) : null,
    requiredVotes: Number(requiredVotes),
    consensusThreshold: Number(consensusThreshold),
    supervisorId: supervisorId ? Number(supervisorId) : null,
  }).returning();
  res.status(201).json(task);
});

router.get("/tasks/review", async (req, res): Promise<void> => {
  const stage = String(req.query.stage ?? "supervisor_review");
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.reviewStage, stage))
    .orderBy(desc(tasksTable.consensusCount))
    .limit(100);
  res.json(tasks);
});

router.patch("/tasks/:id/supervisor-approve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const supervisorId = Number(req.body?.supervisorId);
  if (!Number.isFinite(id) || !Number.isFinite(supervisorId)) {
    res.status(400).json({ error: "Invalid task or supervisor" });
    return;
  }

  const [task] = await db.update(tasksTable).set({
    status: "pending_admin",
    reviewStage: "admin_review",
    supervisorId,
    supervisorApprovedAt: new Date(),
  }).where(eq(tasksTable.id, id)).returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(task);
});

router.patch("/tasks/:id/admin-approve", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const adminId = Number(req.body?.adminId);
  if (!Number.isFinite(id) || !Number.isFinite(adminId)) {
    res.status(400).json({ error: "Invalid task or admin" });
    return;
  }

  const [task] = await db.update(tasksTable).set({
    status: "approved",
    reviewStage: "published",
    adminApprovedAt: new Date(),
    approvedAt: new Date(),
    rewardReleased: true,
  }).where(eq(tasksTable.id, id)).returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const responses = await db.select().from(taskResponsesTable).where(eq(taskResponsesTable.taskId, id));
  const correctResponses = responses.filter((response) => response.answer === task.finalLabel || response.isCorrect === true);

  for (const response of correctResponses) {
    await db.insert(rewardLedgerTable).values({
      userId: response.userId,
      taskId: task.id,
      role: "operator",
      amountTon: task.operatorRewardTon,
      pointsValue: task.taskValuePoints,
      status: "approved",
    });
    await db.update(taskResponsesTable).set({
      rewardTon: task.operatorRewardTon,
      rewardStatus: "approved",
    }).where(eq(taskResponsesTable.id, response.id));
  }

  if (task.supervisorId) {
    await db.insert(rewardLedgerTable).values({
      userId: task.supervisorId,
      taskId: task.id,
      role: "supervisor",
      amountTon: task.supervisorRewardTon,
      pointsValue: task.taskValuePoints,
      status: "approved",
    });
  }

  const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminId));
  res.json({ task, rewardsReleased: correctResponses.length + (task.supervisorId ? 1 : 0), approvedBy: admin?.username ?? null });
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid task ID" });
    return;
  }

  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, id));

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(task);
});

export default router;
