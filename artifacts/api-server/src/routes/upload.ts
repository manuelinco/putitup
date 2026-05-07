import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  contributorDatasetsTable,
  contributorItemsTable,
  tasksTable,
  datasetsTable,
  rewardLedgerTable,
} from "@workspace/db";

const router: IRouter = Router();

router.post("/upload/datasets", async (req, res): Promise<void> => {
  const { userId, title, description, taskType, labelingInstructions, labelOptions } = req.body ?? {};
  if (!userId || !title || !taskType) {
    res.status(400).json({ error: "userId, title, and taskType are required" });
    return;
  }
  const validTypes = ["text", "image", "classification"];
  if (!validTypes.includes(String(taskType))) {
    res.status(400).json({ error: "taskType must be text, image, or classification" });
    return;
  }
  const [row] = await db.insert(contributorDatasetsTable).values({
    userId: Number(userId),
    title: String(title),
    description: description ? String(description) : null,
    taskType: String(taskType),
    labelingInstructions: labelingInstructions ? String(labelingInstructions) : null,
    labelOptions: Array.isArray(labelOptions) ? labelOptions : null,
    status: "pending",
  }).returning();
  res.status(201).json(row);
});

router.post("/upload/datasets/:id/items", async (req, res): Promise<void> => {
  const contribDatasetId = Number(req.params.id);
  const { items } = req.body ?? {};
  if (!Number.isFinite(contribDatasetId)) {
    res.status(400).json({ error: "Invalid contributor dataset ID" });
    return;
  }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "items array is required" });
    return;
  }
  if (items.length > 200) {
    res.status(400).json({ error: "Max 200 items per submission" });
    return;
  }

  const [contribDataset] = await db
    .select()
    .from(contributorDatasetsTable)
    .where(eq(contributorDatasetsTable.id, contribDatasetId));

  if (!contribDataset) {
    res.status(404).json({ error: "Contributor dataset not found" });
    return;
  }
  if (contribDataset.status !== "pending") {
    res.status(409).json({ error: "Cannot add items to a dataset that is already submitted" });
    return;
  }

  const VALID_CONTENT_TYPES = ["text", "image_url", "audio_url", "video_url"];
  const MAX_CONTENT_LENGTH = 10_000;
  const validatedRows: Array<{ contributorDatasetId: number; content: string; contentType: string }> = [];

  for (const item of items) {
    const ct = String(item.contentType ?? "text");
    const content = String(item.content ?? "").slice(0, MAX_CONTENT_LENGTH);
    if (!VALID_CONTENT_TYPES.includes(ct)) {
      res.status(400).json({ error: `Invalid contentType: ${ct}` });
      return;
    }
    if (content.trim().length === 0) {
      res.status(400).json({ error: "Empty content is not allowed" });
      return;
    }
    if ((ct === "image_url" || ct === "audio_url" || ct === "video_url") && !/^https?:\/\/.+/.test(content)) {
      res.status(400).json({ error: `contentType ${ct} requires a valid https URL` });
      return;
    }
    validatedRows.push({ contributorDatasetId: contribDatasetId, content, contentType: ct });
  }

  const rows = validatedRows;

  const inserted = await db.insert(contributorItemsTable).values(rows).returning();

  const newTotal = contribDataset.totalItems + inserted.length;
  await db
    .update(contributorDatasetsTable)
    .set({ totalItems: newTotal })
    .where(eq(contributorDatasetsTable.id, contribDatasetId));

  res.status(201).json({ inserted: inserted.length, totalItems: newTotal });
});

router.post("/upload/datasets/:id/submit", async (req, res): Promise<void> => {
  const contribDatasetId = Number(req.params.id);
  if (!Number.isFinite(contribDatasetId)) {
    res.status(400).json({ error: "Invalid contributor dataset ID" });
    return;
  }

  const [contribDataset] = await db
    .select()
    .from(contributorDatasetsTable)
    .where(eq(contributorDatasetsTable.id, contribDatasetId));

  if (!contribDataset) {
    res.status(404).json({ error: "Contributor dataset not found" });
    return;
  }
  if (contribDataset.status !== "pending") {
    res.status(409).json({ error: "Dataset already submitted" });
    return;
  }
  if (contribDataset.totalItems < 3) {
    res.status(400).json({ error: "You need at least 3 items to submit" });
    return;
  }

  const items = await db
    .select()
    .from(contributorItemsTable)
    .where(eq(contributorItemsTable.contributorDatasetId, contribDatasetId));

  const dataset = await db.insert(datasetsTable).values({
    name: `[Contributor] ${contribDataset.title}`,
    description: contribDataset.description ?? `Contributor dataset by user #${contribDataset.userId}`,
    category: contribDataset.taskType === "image" ? "Vision" : contribDataset.taskType === "text" ? "NLP" : "Classification",
    status: "active",
    accessType: "premium",
    workflowMode: "consensus",
    votesRequired: 3,
    consensusThreshold: 0.99,
    tokenCost: 0,
    adsRequired: 0,
    requestedTaskCount: items.length,
    recordCount: items.length,
    tags: ["contributor-upload", contribDataset.taskType],
  }).returning();

  const datasetId = dataset[0].id;

  const labelOptions = Array.isArray(contribDataset.labelOptions)
    ? (contribDataset.labelOptions as string[])
    : ["Yes", "No"];

  const taskRows = items.map((item) => ({
    datasetId,
    type: (contribDataset.taskType === "image" ? "image" : "text") as "text" | "image" | "classification",
    dataPayload: {
      question: contribDataset.labelingInstructions ?? "Please label this item:",
      content: item.content,
      imageUrl: item.contentType === "image_url" ? item.content : undefined,
      options: labelOptions,
    },
    correctAnswer: null,
    difficulty: "easy" as const,
    pointsReward: 10,
    isGolden: false,
    requiredVotes: 3,
    consensusThreshold: 0.99,
    operatorRewardTon: 0.00004,
    supervisorRewardTon: 0.0001,
    status: "active",
    reviewStage: "labeling",
  }));

  const createdTasks = await db.insert(tasksTable).values(taskRows).returning({ id: tasksTable.id });

  for (let i = 0; i < items.length; i++) {
    await db
      .update(contributorItemsTable)
      .set({ taskId: createdTasks[i]?.id ?? null })
      .where(eq(contributorItemsTable.id, items[i].id));
  }

  const [updated] = await db
    .update(contributorDatasetsTable)
    .set({ status: "labeling", datasetId })
    .where(eq(contributorDatasetsTable.id, contribDatasetId))
    .returning();

  res.json({ contribDataset: updated, datasetId, tasksCreated: createdTasks.length });
});

router.get("/upload/my-datasets/:userId", async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const datasets = await db
    .select()
    .from(contributorDatasetsTable)
    .where(eq(contributorDatasetsTable.userId, userId))
    .orderBy(desc(contributorDatasetsTable.createdAt));

  for (const ds of datasets) {
    if (ds.status === "labeling" && ds.datasetId) {
      const tasks = await db
        .select()
        .from(tasksTable)
        .where(and(eq(tasksTable.datasetId, ds.datasetId), eq(tasksTable.reviewStage, "published")));

      const labeledPct = ds.totalItems > 0 ? Math.round((tasks.length / ds.totalItems) * 100) : 0;
      if (labeledPct >= 80 && !ds.rewardPaid) {
        const quality = Math.max(0, Math.min(100, labeledPct));
        const tonReward = parseFloat((quality / 100 * ds.totalItems * 0.00001).toFixed(6));
        const energyReward = Math.min(1000, ds.totalItems * 5);
        await db
          .update(contributorDatasetsTable)
          .set({
            labeledItems: tasks.length,
            qualityScore: quality,
            rewardTon: tonReward,
            rewardEnergy: energyReward,
            status: "completed",
          })
          .where(eq(contributorDatasetsTable.id, ds.id));

        await db.insert(rewardLedgerTable).values({
          userId,
          datasetId: ds.datasetId,
          role: "contributor",
          rewardType: "task",
          amountTon: tonReward,
          pointsValue: energyReward * 2,
          status: "approved",
        });
      } else {
        await db
          .update(contributorDatasetsTable)
          .set({ labeledItems: tasks.length })
          .where(eq(contributorDatasetsTable.id, ds.id));
      }
    }
  }

  const refreshed = await db
    .select()
    .from(contributorDatasetsTable)
    .where(eq(contributorDatasetsTable.userId, userId))
    .orderBy(desc(contributorDatasetsTable.createdAt));

  res.json(refreshed);
});

router.get("/upload/datasets/:id/items", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const items = await db
    .select()
    .from(contributorItemsTable)
    .where(eq(contributorItemsTable.contributorDatasetId, id));
  res.json(items);
});

export default router;
