import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, desc, and, gte, ilike, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  tasksTable,
  taskResponsesTable,
  datasetsTable,
  rewardLedgerTable,
  pendingPaymentsTable,
  adsTrackingTable,
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

  res.json({ dataset: updated, pendingPaymentsCreated: collaborators.length });
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

const RISK_BLOCK = 100;

/**
 * GET /api/admin/bot-watch
 * Lists users by anti-bot risk (highest first) so an admin can monitor and
 * manage suspected bots. Joins users with their ad-tracking record.
 */
router.get("/admin/bot-watch", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      userId: usersTable.id,
      username: usersTable.username,
      telegramId: usersTable.telegramId,
      riskScore: adsTrackingTable.riskScore,
      suspiciousCount: adsTrackingTable.suspiciousCount,
      cooldownUntil: adsTrackingTable.cooldownUntil,
      lastViewTime: adsTrackingTable.lastViewTime,
      adsWatchedToday: adsTrackingTable.adsWatchedToday,
      totalAdsWatched: adsTrackingTable.totalAdsWatched,
    })
    .from(adsTrackingTable)
    .innerJoin(usersTable, eq(adsTrackingTable.userId, usersTable.id))
    .orderBy(desc(adsTrackingTable.riskScore), desc(adsTrackingTable.suspiciousCount))
    .limit(100);

  res.json(rows.map((r) => ({ ...r, blocked: r.riskScore >= RISK_BLOCK })));
});

/**
 * PATCH /api/admin/users/:id/block
 * Body: { block: boolean }
 * Manually block (risk -> 100) or clear (risk -> 0, reset cooldown/suspicious) a user.
 */
router.patch("/admin/users/:id/block", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const block = Boolean(req.body?.block);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const now = new Date();
  let [rec] = await db
    .select()
    .from(adsTrackingTable)
    .where(eq(adsTrackingTable.userId, id));
  if (!rec) {
    [rec] = await db
      .insert(adsTrackingTable)
      .values({ userId: id, lastResetDate: now })
      .returning();
  }

  const [updated] = await db
    .update(adsTrackingTable)
    .set({
      riskScore: block ? RISK_BLOCK : 0,
      suspiciousCount: block ? rec.suspiciousCount : 0,
      cooldownUntil: block ? new Date(now.getTime() + 3_600_000) : null,
    })
    .where(eq(adsTrackingTable.userId, id))
    .returning();

  res.json({ success: true, userId: id, blocked: block, tracking: updated });
});

/**
 * GET /api/admin/users?search=
 * Admin-only user directory used by the role-management UI. Returns the role
 * flags (isSupervisor / isModerator / isAdmin) so the admin can promote/demote.
 */
router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const base = db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      telegramId: usersTable.telegramId,
      points: usersTable.points,
      level: usersTable.level,
      isAdmin: usersTable.isAdmin,
      isSupervisor: usersTable.isSupervisor,
      isModerator: usersTable.isModerator,
    })
    .from(usersTable)
    .$dynamic();

  const rows = await (search
    ? base.where(ilike(usersTable.username, `%${search}%`))
    : base
  )
    .orderBy(desc(usersTable.createdAt))
    .limit(50);

  res.json(rows);
});

/**
 * POST /api/admin/users/:id/role
 * Body: { role: "supervisor" | "moderator" | "none", value?: boolean }
 * Promote/demote a user. `supervisor`/`moderator` set the corresponding flag to
 * `value` (default true); `none` clears both elevated roles.
 */
router.post("/admin/users/:id/role", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const role = String(req.body?.role ?? "");
  const value = req.body?.value === undefined ? true : Boolean(req.body.value);

  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  if (role !== "supervisor" && role !== "moderator" && role !== "none") {
    res.status(400).json({ error: "role must be 'supervisor', 'moderator' or 'none'" });
    return;
  }

  const set: { isSupervisor?: boolean; isModerator?: boolean } = {};
  if (role === "supervisor") set.isSupervisor = value;
  else if (role === "moderator") set.isModerator = value;
  else {
    set.isSupervisor = false;
    set.isModerator = false;
  }

  const [updated] = await db
    .update(usersTable)
    .set(set)
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      isAdmin: usersTable.isAdmin,
      isSupervisor: usersTable.isSupervisor,
      isModerator: usersTable.isModerator,
    });

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ success: true, user: updated });
});

const ANTIBOT_CONFIG = {
  dailyAdCap: 20,
  adCooldownSeconds: 30,
  minAdSeconds: 10,
  riskBlockThreshold: RISK_BLOCK,
  flagThreshold: 50,
};

/**
 * GET /api/admin/antibot-config
 * Returns the live anti-bot policy values plus real-time aggregates from the
 * ads-tracking table (how many users are tracked / flagged / blocked).
 */
router.get("/admin/antibot-config", requireAdmin, async (_req, res): Promise<void> => {
  const [tracked] = await db.select({ count: sql<number>`count(*)::int` }).from(adsTrackingTable);
  const [blocked] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adsTrackingTable)
    .where(gte(adsTrackingTable.riskScore, ANTIBOT_CONFIG.riskBlockThreshold));
  const [flagged] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adsTrackingTable)
    .where(gte(adsTrackingTable.riskScore, ANTIBOT_CONFIG.flagThreshold));

  res.json({
    config: ANTIBOT_CONFIG,
    stats: {
      tracked: tracked?.count ?? 0,
      blocked: blocked?.count ?? 0,
      flagged: flagged?.count ?? 0,
    },
  });
});

export default router;
