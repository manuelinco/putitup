import { Router, type IRouter } from "express";
import { eq, and, notInArray, desc, gte, lt, sql } from "drizzle-orm";
import { db, tasksTable, taskResponsesTable, rewardLedgerTable, usersTable } from "@workspace/db";
import {
  ListTasksQueryParams,
  CreateTaskBody,
  GetTaskParams,
  GetNextTaskQueryParams,
} from "@workspace/api-zod";
import {
  generateVirtualTask,
  VIRTUAL_DATASET_IDS,
  VIRTUAL_SLOT_COUNT,
} from "../lib/virtualTasks";

const router: IRouter = Router();

router.get("/tasks/stats", async (_req, res): Promise<void> => {
  const [
    [totalRow],
    [responseCountRow],
    byTypeRows,
    byDifficultyRows,
    [goldenRow],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(tasksTable),
    db.select({ count: sql<number>`count(*)::int` }).from(taskResponsesTable),
    db.select({ type: tasksTable.type, count: sql<number>`count(*)::int` })
      .from(tasksTable).groupBy(tasksTable.type),
    db.select({ difficulty: tasksTable.difficulty, count: sql<number>`count(*)::int` })
      .from(tasksTable).groupBy(tasksTable.difficulty),
    db.select({ count: sql<number>`count(*)::int` }).from(tasksTable).where(eq(tasksTable.isGolden, true)),
  ]);

  const total = totalRow?.count ?? 0;
  const totalResponses = responseCountRow?.count ?? 0;
  const goldenCount = goldenRow?.count ?? 0;

  const byType = { image: 0, text: 0, classification: 0 } as Record<string, number>;
  for (const r of byTypeRows) byType[r.type] = r.count;

  const byDifficulty = { easy: 0, medium: 0, hard: 0 } as Record<string, number>;
  for (const r of byDifficultyRows) byDifficulty[r.difficulty] = r.count;

  const completionRate = total > 0 ? Math.min((totalResponses / (total * 3)) * 100, 100) : 0;

  res.json({
    total,
    byType,
    byDifficulty,
    goldenCount,
    completionRate: Math.round(completionRate * 10) / 10,
  });
});

const DATASET_OPTIONS: Record<number, string[]> = {
  // Text / NLP datasets
  10: ["positive", "negative", "neutral"],
  11: ["purchase", "browse", "return", "complaint", "inquiry"],
  13: ["Person", "Organization", "Location", "Date", "Product", "Other"],
  14: ["Response A is better", "Response B is better", "Both are equally good", "Both are poor"],
  15: ["Correct", "Minor errors", "Major errors", "Completely wrong"],
  16: ["Cardiology", "Neurology", "Oncology", "Emergency", "General Practice", "Orthopedics"],
  17: ["Complaint", "Question", "Return request", "Compliment", "Billing issue"],
  18: ["Sincere", "Sarcastic", "Neutral", "Ambiguous"],
  // Image datasets — options cover ANY photo (no impossible answers)
  12: ["Person or people", "Animal or wildlife", "Vehicle or transport", "Building or architecture", "Nature or landscape", "Food or drink", "Electronics or technology", "Furniture or interior", "Other / Mixed"],
  19: ["Excellent", "Good", "Fair", "Poor"],
  20: ["Person or people", "Animal or wildlife", "Vehicle or transport", "Building or architecture", "Nature or landscape", "Food or drink", "Urban or street scene", "Abstract or texture", "Other"],
  21: ["Happy or joyful", "Sad or upset", "Angry or frustrated", "Surprised or shocked", "Neutral or calm", "No person or face visible"],
  22: ["Excellent — sharp, well-lit, professional", "Good — minor issues but usable", "Fair — noticeable blur or lighting problems", "Poor — very low quality or unusable"],
  29: ["Urban or city environment", "Forest or woodland", "Countryside or farmland", "Coastal or water", "Desert or arid landscape", "Indoor or built interior", "Industrial or commercial site", "Other natural scene"],
  // Audio datasets
  23: ["Correct", "Minor word errors", "Missing words", "Completely wrong"],
  24: ["Correct", "Minor errors", "Missing content", "Incorrect"],
  25: ["Correct", "Minor errors", "Missing content", "Incorrect"],
  26: ["English", "Italian", "French", "Spanish", "German", "Portuguese", "Other"],
  27: ["Happy", "Sad", "Angry", "Calm", "Excited", "Fearful", "Neutral"],
  // Video
  28: ["Running", "Cooking", "Driving", "Playing sports", "Working", "Dancing", "Reading", "Other"],
};

const AUDIO_TRANSCRIPTION_OPTIONS = [
  "Correct",
  "Incorrect - Word Error",
  "Incorrect - Missing Words",
  "Incorrect - Extra Words",
];

const SENTIMENT_OPTIONS = ["positive", "negative", "neutral"];
const BINARY_OPTIONS = ["Yes", "No"];

function enrichTask(task: typeof tasksTable.$inferSelect) {
  const payload = (task.dataPayload ?? {}) as Record<string, unknown>;

  let options: string[] | undefined =
    Array.isArray(payload.options) ? (payload.options as string[]) : undefined;

  if (!options && task.datasetId && DATASET_OPTIONS[task.datasetId]) {
    options = DATASET_OPTIONS[task.datasetId];
  }

  if (!options) {
    const category = String(payload.category ?? "").toLowerCase();
    const correctAnswer = String(task.correctAnswer ?? "").toLowerCase();
    if (
      payload.audioUrl ||
      payload.transcript ||
      category.includes("speech") ||
      category.includes("transcription")
    ) {
      options = AUDIO_TRANSCRIPTION_OPTIONS;
    } else if (
      category.includes("sentiment") ||
      correctAnswer === "positive" ||
      correctAnswer === "negative" ||
      correctAnswer === "neutral"
    ) {
      options = SENTIMENT_OPTIONS;
    } else {
      options = BINARY_OPTIONS;
    }
  }

  return { ...task, dataPayload: { ...payload, options } };
}

router.get("/tasks/next", async (req, res): Promise<void> => {
  const parsed = GetNextTaskQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId } = parsed.data;

  // Fetch answered task IDs for this user
  const answeredRows = await db
    .select({ taskId: taskResponsesTable.taskId })
    .from(taskResponsesTable)
    .where(eq(taskResponsesTable.userId, userId));
  const answeredTaskIds = answeredRows.map((r) => r.taskId);

  // Get max ID for random pivot (index scan — fast on 11M rows)
  const [maxRow] = await db
    .select({ maxId: sql<number>`max(id)`, minId: sql<number>`min(id)` })
    .from(tasksTable)
    .where(eq(tasksTable.status, "active"));

  if (!maxRow?.maxId) {
    res.status(404).json({ error: "No tasks available" });
    return;
  }

  const minId = Number(maxRow.minId);
  const maxId = Number(maxRow.maxId);
  const pivotId = Math.floor(Math.random() * (maxId - minId + 1)) + minId;

  // Filter out tasks with non-English questions (Italian legacy tasks have à è é ì ò ù)
  const englishOnly = sql`(${tasksTable.dataPayload}->>'question') !~ '[àèéìòùÀÈÉÌÒÙáãâäåæçñøœ]'`;

  const baseFilter =
    answeredTaskIds.length > 0
      ? and(eq(tasksTable.status, "active"), notInArray(tasksTable.id, answeredTaskIds), englishOnly)
      : and(eq(tasksTable.status, "active"), englishOnly);

  // Try from random pivot forward (index scan)
  let [task] = await db
    .select()
    .from(tasksTable)
    .where(and(baseFilter, gte(tasksTable.id, pivotId)))
    .orderBy(tasksTable.id)
    .limit(1);

  // Wrap around: try from the beginning if nothing found after pivot
  if (!task) {
    [task] = await db
      .select()
      .from(tasksTable)
      .where(and(baseFilter, lt(tasksTable.id, pivotId)))
      .orderBy(tasksTable.id)
      .limit(1);
  }

  if (!task) {
    // ── Virtual task fallback ──────────────────────────────────────────────
    // Count how many virtual-task responses this user already has so we pick
    // an unseen slot. We identify virtual responses by taskId > 1e10.
    const [vcRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(taskResponsesTable)
      .where(
        and(
          eq(taskResponsesTable.userId, userId),
          sql`${taskResponsesTable.taskId} > 10000000000`,
        ),
      );
    const virtualDoneCount = Number(vcRow?.n ?? 0);

    // Pick a random dataset from the virtual set and a slot
    const datasetId = VIRTUAL_DATASET_IDS[
      Math.floor(Math.random() * VIRTUAL_DATASET_IDS.length)
    ]!;
    const slot = virtualDoneCount % VIRTUAL_SLOT_COUNT;

    const vtask = generateVirtualTask(datasetId, slot);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.json(vtask);
    return;
  }

  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
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
  const stage = String(req.query.stage ?? "controller_review");
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

  const [supervisor] = await db.select({ id: usersTable.id, isSupervisor: usersTable.isSupervisor, isAdmin: usersTable.isAdmin })
    .from(usersTable).where(eq(usersTable.id, supervisorId));
  if (!supervisor || (!supervisor.isSupervisor && !supervisor.isAdmin)) {
    res.status(403).json({ error: "Forbidden: supervisorId is not a supervisor" });
    return;
  }

  const [task] = await db.update(tasksTable).set({
    status: "pending_admin",
    reviewStage: "admin_review",
    supervisorId,
    supervisorApprovedAt: new Date(),
  }).where(and(eq(tasksTable.id, id), eq(tasksTable.reviewStage, "controller_review"))).returning();

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

  const [admin] = await db.select({ id: usersTable.id, isAdmin: usersTable.isAdmin })
    .from(usersTable).where(eq(usersTable.id, adminId));
  if (!admin?.isAdmin) {
    res.status(403).json({ error: "Forbidden: adminId is not an admin" });
    return;
  }

  const [task] = await db.update(tasksTable).set({
    status: "approved",
    reviewStage: "published",
    adminApprovedAt: new Date(),
    approvedAt: new Date(),
    rewardReleased: true,
  }).where(and(eq(tasksTable.id, id), eq(tasksTable.rewardReleased, false))).returning();

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

  const [approver] = await db.select().from(usersTable).where(eq(usersTable.id, adminId));
  res.json({ task, rewardsReleased: correctResponses.length + (task.supervisorId ? 1 : 0), approvedBy: approver?.username ?? null });
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
