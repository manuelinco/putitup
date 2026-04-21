import { Router, type IRouter } from "express";
import { eq, desc, ilike, and } from "drizzle-orm";
import { db, datasetsTable, activityEventsTable, usersTable, tasksTable } from "@workspace/db";
import {
  ListDatasetsQueryParams,
  CreateDatasetBody,
  GetDatasetParams,
  UpdateDatasetParams,
  UpdateDatasetBody,
  DownloadDatasetParams,
  DownloadDatasetBody,
} from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/datasets/featured", async (_req, res): Promise<void> => {
  const datasets = await db
    .select()
    .from(datasetsTable)
    .orderBy(desc(datasetsTable.downloadCount))
    .limit(6);
  res.json(datasets);
});

router.get("/datasets/categories", async (_req, res): Promise<void> => {
  const results = await db
    .select({
      category: datasetsTable.category,
      count: sql<number>`count(*)::int`,
    })
    .from(datasetsTable)
    .groupBy(datasetsTable.category)
    .orderBy(desc(sql`count(*)`));
  res.json(results);
});

router.get("/datasets", async (req, res): Promise<void> => {
  const parsed = ListDatasetsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { category, accessType, search, limit, offset } = parsed.data;

  let query = db.select().from(datasetsTable).$dynamic();
  const conditions = [];
  if (category) conditions.push(eq(datasetsTable.category, category));
  if (accessType) conditions.push(eq(datasetsTable.accessType, accessType));
  if (search) conditions.push(ilike(datasetsTable.name, `%${search}%`));
  if (conditions.length > 0) query = query.where(and(...conditions));

  const datasets = await query
    .orderBy(desc(datasetsTable.downloadCount))
    .limit(limit ?? 20)
    .offset(offset ?? 0);
  res.json(datasets);
});

router.post("/datasets", async (req, res): Promise<void> => {
  const {
    name,
    description,
    category,
    accessType = "ads",
    qualityScore = 0,
    price = null,
    adsRequired = 5,
    tokenCost = 10,
    workflowMode = "consensus",
    votesRequired = 3,
    consensusThreshold = 0.8,
    supervisorId = null,
    importMode = "manual",
    requestedTaskCount = 0,
    tags = [],
  } = req.body ?? {};

  if (!name || !description || !category) {
    res.status(400).json({ error: "name, description and category are required" });
    return;
  }

  const [dataset] = await db
    .insert(datasetsTable)
    .values({
      name: String(name),
      description: String(description),
      category: String(category),
      accessType,
      qualityScore: Number(qualityScore),
      price: price === null || price === "" ? null : Number(price),
      adsRequired: Number(adsRequired),
      tokenCost: Number(tokenCost),
      workflowMode: String(workflowMode),
      status: "active",
      votesRequired: Number(votesRequired),
      consensusThreshold: Number(consensusThreshold),
      supervisorId: supervisorId ? Number(supervisorId) : null,
      importMode: String(importMode),
      requestedTaskCount: Number(requestedTaskCount),
      tags: Array.isArray(tags) ? tags.map(String) : [],
    })
    .returning();
  res.status(201).json(dataset);
});

router.post("/datasets/:id/generate-tasks", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { count = 25, type = "image", prompt, options } = req.body ?? {};
  const safeCount = Math.min(Math.max(Number(count) || 1, 1), 1000);

  const [dataset] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, id));
  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  const labels = Array.isArray(options) && options.length > 1 ? options.map(String) : ["cat", "dog", "car", "person"];
  const rows = Array.from({ length: safeCount }, (_, index) => {
    const label = labels[index % labels.length];
    const question = prompt || (type === "image" ? "What is visible in this image?" : "Choose the best label for this item");
    return {
      datasetId: dataset.id,
      type,
      dataPayload: {
        question,
        text: type === "text" ? `Sample text ${dataset.id}-${Date.now()}-${index}: classify this content as ${label} or another label.` : undefined,
        imageUrl: type === "image" ? `https://picsum.photos/seed/ia-${dataset.id}-${Date.now()}-${index}/640/420` : undefined,
        options: labels,
        source: "admin_generator",
        generatedIndex: index,
      },
      difficulty: "easy",
      pointsReward: 10,
      requiredVotes: dataset.votesRequired,
      consensusThreshold: dataset.consensusThreshold,
      supervisorId: dataset.supervisorId,
      taskValuePoints: 10,
      operatorRewardTon: 0.00001,
      supervisorRewardTon: 0.0001,
      rawSource: "admin_generator",
    };
  });

  const created = await db.insert(tasksTable).values(rows).returning();
  await db.update(datasetsTable).set({
    requestedTaskCount: dataset.requestedTaskCount + safeCount,
    recordCount: (dataset.recordCount ?? 0) + safeCount,
  }).where(eq(datasetsTable.id, dataset.id));

  res.status(201).json({ created: created.length, requested: Number(count), cappedAt: safeCount, datasetId: dataset.id });
});

router.post("/datasets/nightly-publish", async (_req, res): Promise<void> => {
  const datasets = await db.select().from(datasetsTable);
  const now = new Date();
  const results = [];

  for (const dataset of datasets) {
    const approved = await db
      .select()
      .from(tasksTable)
      .where(and(eq(tasksTable.datasetId, dataset.id), eq(tasksTable.status, "approved")));

    const qualityScore = dataset.requestedTaskCount > 0
      ? Math.min(99.9, Math.round((approved.length / dataset.requestedTaskCount) * 1000) / 10)
      : dataset.qualityScore;

    const [updated] = await db.update(datasetsTable).set({
      approvedRecordCount: approved.length,
      qualityScore,
      status: approved.length > 0 ? "published" : dataset.status,
      nightlyPublishedAt: now,
    }).where(eq(datasetsTable.id, dataset.id)).returning();

    results.push({ datasetId: dataset.id, approvedRecords: approved.length, status: updated.status });
  }

  res.json({ publishedAt: now, results });
});

router.get("/datasets/:id", async (req, res): Promise<void> => {
  const params = GetDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [dataset] = await db
    .select()
    .from(datasetsTable)
    .where(eq(datasetsTable.id, params.data.id));

  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  res.json(dataset);
});

router.patch("/datasets/:id", async (req, res): Promise<void> => {
  const params = UpdateDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDatasetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [dataset] = await db
    .update(datasetsTable)
    .set(parsed.data)
    .where(eq(datasetsTable.id, params.data.id))
    .returning();

  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  res.json(dataset);
});

router.post("/datasets/:id/download", async (req, res): Promise<void> => {
  const params = DownloadDatasetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = DownloadDatasetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [dataset] = await db
    .update(datasetsTable)
    .set({ downloadCount: sql`${datasetsTable.downloadCount} + 1` })
    .where(eq(datasetsTable.id, params.data.id))
    .returning();

  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  if (parsed.data.userId) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, parsed.data.userId));

    if (user) {
      await db.insert(activityEventsTable).values({
        type: "dataset_downloaded",
        userId: user.id,
        username: user.username,
        description: `${user.username} downloaded "${dataset.name}"`,
        metadata: { datasetId: dataset.id, paymentMethod: parsed.data.paymentMethod },
      });
    }
  }

  res.json(dataset);
});

export default router;
