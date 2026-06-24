import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  tasksTable,
  taskResponsesTable,
  datasetsTable,
  rewardLedgerTable,
  pendingPaymentsTable,
  lotteryDrawsTable,
} from "@workspace/db";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

router.post("/admin/claim", async (req, res): Promise<void> => {
  const { username, password } = req.body ?? {};
  const ADMIN_USERNAME = process.env["ADMIN_USERNAME"];
  const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"];

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    res.status(503).json({ error: "Admin credentials not configured" });
    return;
  }

  const paddedUser = username ?? "";
  const paddedPass = password ?? "";
  let usernameMatch = false;
  let passwordMatch = false;
  try {
    const uBuf = Buffer.from(String(paddedUser));
    const uRef = Buffer.from(ADMIN_USERNAME);
    const pBuf = Buffer.from(String(paddedPass));
    const pRef = Buffer.from(ADMIN_PASSWORD);
    if (uBuf.length === uRef.length) usernameMatch = crypto.timingSafeEqual(uBuf, uRef);
    if (pBuf.length === pRef.length) passwordMatch = crypto.timingSafeEqual(pBuf, pRef);
  } catch {}
  if (!usernameMatch || !passwordMatch) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found. Register first via Telegram, then claim admin." });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ isAdmin: true, isSupervisor: true })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json({ success: true, user: updated });
});

router.get("/admin/pending-payments", requireAdmin, async (_req, res): Promise<void> => {
  const payments = await db
    .select({
      payment: pendingPaymentsTable,
      user: {
        id: usersTable.id,
        username: usersTable.username,
        walletAddress: usersTable.walletAddress,
      },
    })
    .from(pendingPaymentsTable)
    .leftJoin(usersTable, eq(pendingPaymentsTable.userId, usersTable.id))
    .where(eq(pendingPaymentsTable.isPaid, false))
    .orderBy(desc(pendingPaymentsTable.createdAt));
  res.json(payments);
});

router.patch("/admin/pending-payments/:id/mark-paid", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { txHash } = req.body ?? {};
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid payment ID" });
    return;
  }

  const [payment] = await db
    .update(pendingPaymentsTable)
    .set({ isPaid: true, paidAt: new Date(), txHash: txHash ?? null })
    .where(eq(pendingPaymentsTable.id, id))
    .returning();

  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  await db
    .update(rewardLedgerTable)
    .set({ paidAt: new Date() })
    .where(
      and(
        eq(rewardLedgerTable.userId, payment.userId),
        eq(rewardLedgerTable.status, "approved"),
      )
    );

  res.json(payment);
});

router.get("/admin/datasets-review", requireAdmin, async (_req, res): Promise<void> => {
  const datasets = await db
    .select()
    .from(datasetsTable)
    .where(eq(datasetsTable.status, "active"))
    .orderBy(desc(datasetsTable.createdAt));
  res.json(datasets);
});

router.post("/admin/datasets/:id/approve-publish", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const adminId = Number(req.body?.adminId);

  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid dataset ID" });
    return;
  }

  const [dataset] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, id));
  if (!dataset) {
    res.status(404).json({ error: "Dataset not found" });
    return;
  }

  const approvedTasks = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.datasetId, id), eq(tasksTable.status, "approved")));

  const qualityScore =
    dataset.requestedTaskCount > 0
      ? Math.min(99.9, Math.round((approvedTasks.length / dataset.requestedTaskCount) * 1000) / 10)
      : 99.0;

  const [updated] = await db
    .update(datasetsTable)
    .set({
      status: "published",
      qualityScore,
      approvedRecordCount: approvedTasks.length,
      nightlyPublishedAt: new Date(),
    })
    .where(eq(datasetsTable.id, id))
    .returning();

  let lotteryResult = null;
  if (dataset.lotteryPool > 0 && dataset.lotteryWinners > 0) {
    const contributors = await db
      .select({ userId: taskResponsesTable.userId })
      .from(taskResponsesTable)
      .innerJoin(tasksTable, eq(taskResponsesTable.taskId, tasksTable.id))
      .where(eq(tasksTable.datasetId, id))
      .groupBy(taskResponsesTable.userId);

    if (contributors.length > 0) {
      const winnerCount = Math.min(dataset.lotteryWinners, contributors.length);
      const indices = new Set<number>();
      while (indices.size < winnerCount) {
        indices.add(crypto.randomInt(0, contributors.length));
      }
      const winners = [...indices].map((i) => contributors[i]);
      const prizePerWinner = dataset.lotteryPool / winnerCount;

      for (const winner of winners) {
        await db.insert(rewardLedgerTable).values({
          userId: winner.userId,
          datasetId: id,
          role: "lottery_winner",
          rewardType: "lottery",
          amountTon: prizePerWinner,
          pointsValue: Math.round(prizePerWinner * 1000000),
          status: "approved",
        });
      }

      const [draw] = await db.insert(lotteryDrawsTable).values({
        datasetId: id,
        prizePoolTon: dataset.lotteryPool,
        winnersCount: winnerCount,
        winners: winners.map((w) => w.userId),
        totalContributors: contributors.length,
      }).returning();

      await db.update(datasetsTable).set({ lotteryDrawnAt: new Date() }).where(eq(datasetsTable.id, id));
      lotteryResult = draw;
    }
  }

  const collaborators = await db
    .select({ userId: taskResponsesTable.userId })
    .from(taskResponsesTable)
    .innerJoin(tasksTable, eq(taskResponsesTable.taskId, tasksTable.id))
    .where(eq(tasksTable.datasetId, id))
    .groupBy(taskResponsesTable.userId);

  const rewardPerUser = 0.00004 * approvedTasks.length / Math.max(collaborators.length, 1);
  for (const collab of collaborators) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, collab.userId));
    if (!user?.walletAddress) continue;
    const [existing] = await db
      .select()
      .from(pendingPaymentsTable)
      .where(and(eq(pendingPaymentsTable.userId, collab.userId), eq(pendingPaymentsTable.datasetId, id), eq(pendingPaymentsTable.isPaid, false)));
    if (!existing) {
      await db.insert(pendingPaymentsTable).values({
        userId: collab.userId,
        walletAddress: user.walletAddress,
        amountTon: rewardPerUser,
        reason: "task_rewards",
        datasetId: id,
      });
    }
  }

  res.json({ dataset: updated, lotteryResult, pendingPaymentsCreated: collaborators.length });
});

router.get("/admin/stats", requireAdmin, async (_req, res): Promise<void> => {
  const [totalUsers] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
  const [totalTasks] = await db.select({ count: sql<number>`count(*)::int` }).from(tasksTable);
  const [totalResponses] = await db.select({ count: sql<number>`count(*)::int` }).from(taskResponsesTable);
  const [totalDatasets] = await db.select({ count: sql<number>`count(*)::int` }).from(datasetsTable);
  const [pendingCount] = await db.select({ count: sql<number>`count(*)::int` }).from(pendingPaymentsTable).where(eq(pendingPaymentsTable.isPaid, false));
  const [paidSum] = await db.select({ total: sql<number>`coalesce(sum(amount_ton),0)::float` }).from(pendingPaymentsTable).where(eq(pendingPaymentsTable.isPaid, true));

  res.json({
    totalUsers: totalUsers?.count ?? 0,
    totalTasks: totalTasks?.count ?? 0,
    totalResponses: totalResponses?.count ?? 0,
    totalDatasets: totalDatasets?.count ?? 0,
    pendingPayments: pendingCount?.count ?? 0,
    totalPaidTon: paidSum?.total ?? 0,
  });
});

router.post("/admin/tasks/batch", requireAdmin, async (req, res): Promise<void> => {
  const { datasetId, tasks } = req.body ?? {};
  if (!Array.isArray(tasks) || tasks.length === 0) {
    res.status(400).json({ error: "tasks array is required" });
    return;
  }
  if (tasks.length > 500) {
    res.status(400).json({ error: "Max 500 tasks per batch" });
    return;
  }

  const rows = tasks.map((t: any) => ({
    datasetId: datasetId ? Number(datasetId) : null,
    type: t.type ?? "text",
    dataPayload: t.dataPayload ?? { question: t.question ?? "", content: t.content ?? "" },
    correctAnswer: t.correctAnswer ?? null,
    difficulty: t.difficulty ?? "easy",
    pointsReward: Number(t.pointsReward ?? 10),
    isGolden: Boolean(t.isGolden ?? false),
    requiredVotes: 5,
    consensusThreshold: 0.99,
    operatorRewardTon: 0.00004,
    supervisorRewardTon: 0.0001,
    status: "active",
    reviewStage: "labeling",
  }));

  const created = await db.insert(tasksTable).values(rows).returning({ id: tasksTable.id });
  res.status(201).json({ created: created.length, ids: created.map((t) => t.id) });
});

export default router;
