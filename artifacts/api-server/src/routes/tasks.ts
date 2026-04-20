import { Router, type IRouter } from "express";
import { eq, ne, sql, and, notInArray } from "drizzle-orm";
import { db, tasksTable, taskResponsesTable } from "@workspace/db";
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
      .where(notInArray(tasksTable.id, answeredTaskIds))
      .limit(1);
    task = t;
  } else {
    const [t] = await db.select().from(tasksTable).limit(1);
    task = t;
  }

  if (!task) {
    res.status(404).json({ error: "No tasks available" });
    return;
  }

  res.json(task);
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
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db.insert(tasksTable).values(parsed.data).returning();
  res.status(201).json(task);
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
