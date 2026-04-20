import { Router, type IRouter } from "express";
import { eq, desc, ilike, and } from "drizzle-orm";
import { db, datasetsTable, activityEventsTable, usersTable } from "@workspace/db";
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
  const parsed = CreateDatasetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [dataset] = await db
    .insert(datasetsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(dataset);
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
