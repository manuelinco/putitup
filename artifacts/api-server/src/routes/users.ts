import { Router, type IRouter } from "express";
import { eq, desc, or } from "drizzle-orm";
import { db, usersTable, taskResponsesTable, adsTrackingTable, rewardLedgerTable } from "@workspace/db";

import {
  ListUsersQueryParams,
  GetUserParams,
  UpdateUserParams,
  UpdateUserBody,
  GetUserStatsParams,
  GetUserByTelegramParams,
} from "@workspace/api-zod";
import { signSessionToken } from "../lib/sessionToken";
import { verifyTelegramInitData } from "../lib/telegramAuth";
import { requireSelf } from "../middleware/requireUser";

const ENERGY_REGEN_PER_30MIN = 1;
const REGEN_INTERVAL_MS = 30 * 60 * 1000;

async function applyPassiveEnergyRegen(user: typeof usersTable.$inferSelect): Promise<number> {
  if (user.energy >= user.maxEnergy) return user.energy;
  const now = Date.now();
  const lastUpdate = user.createdAt.getTime();
  const elapsed = now - lastUpdate;
  const gained = Math.floor(elapsed / REGEN_INTERVAL_MS) * ENERGY_REGEN_PER_30MIN;
  if (gained <= 0) return user.energy;
  const newEnergy = Math.min(user.energy + gained, user.maxEnergy);
  await db.update(usersTable)
    .set({ energy: newEnergy })
    .where(eq(usersTable.id, user.id));
  return newEnergy;
}

const router: IRouter = Router();

router.get("/users", async (req, res): Promise<void> => {
  const parsed = ListUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { level, limit, offset } = parsed.data;

  let query = db.select().from(usersTable).$dynamic();
  if (level) {
    query = query.where(eq(usersTable.level, level));
  }
  const users = await query
    .orderBy(desc(usersTable.points))
    .limit(limit ?? 20)
    .offset(offset ?? 0);

  res.json(users);
});

router.post("/users", async (req, res): Promise<void> => {
  const { username, telegramId, walletAddress, avatarUrl, initData } = req.body ?? {};

  if (!username || typeof username !== "string" || username.length < 3 || username.length > 20) {
    res.status(400).json({ error: "Username must be 3-20 characters" });
    return;
  }
  if (!telegramId && !walletAddress) {
    res.status(400).json({ error: "telegramId or walletAddress is required" });
    return;
  }

  // ── Identity proof for token issuance ─────────────────────────────────────
  // A session token must only be minted for an identity the caller can prove
  // they own. Telegram ownership is proven by a valid HMAC-signed initData; a
  // caller-supplied telegramId on its own is NEVER enough (it is public/guessable
  // and would otherwise allow minting a token for any Telegram account). The
  // verified telegramId from initData is the source of truth and overrides any
  // telegramId in the body. Wallet ownership has no on-chain proof yet, so a
  // wallet token remains a documented residual risk (see by-wallet route).
  let verifiedTelegramId: string | null = null;
  if (typeof initData === "string" && initData.length > 0) {
    const v = verifyTelegramInitData(initData);
    if (v.ok && v.telegramId) verifiedTelegramId = v.telegramId;
  }

  /**
   * Decide which (if any) session token to return for a resolved user.
   * - telegram token: only when initData proved ownership of this user's telegramId
   * - wallet token  : only when the request carried the matching walletAddress
   *                   (residual risk — no signature proof)
   * Otherwise the response is tokenless and legacy soft-mode behaviour applies.
   */
  const tokenFor = (u: typeof usersTable.$inferSelect): string | undefined => {
    if (u.telegramId && verifiedTelegramId && u.telegramId === verifiedTelegramId) {
      return signSessionToken(u.id, "telegram");
    }
    if (u.walletAddress && walletAddress && u.walletAddress === String(walletAddress)) {
      return signSessionToken(u.id, "wallet");
    }
    return undefined;
  };

  // Check for existing user by telegramId or walletAddress
  const conditions = [];
  if (telegramId) conditions.push(eq(usersTable.telegramId, String(telegramId)));
  if (walletAddress) conditions.push(eq(usersTable.walletAddress, String(walletAddress)));

  if (conditions.length > 0) {
    const existing = await db
      .select()
      .from(usersTable)
      .where(or(...conditions))
      .limit(1);

    if (existing.length > 0) {
      const u = existing[0];
      res.status(201).json({ ...u, token: tokenFor(u) });
      return;
    }
  }

  // Persist the verified telegramId when present; fall back to the body value
  // for legacy/soft-mode creation (such accounts are created tokenless above).
  const finalTelegramId = verifiedTelegramId ?? (telegramId ? String(telegramId) : null);

  const base = String(username).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4).padEnd(4, "X");
  const referralCode = `${base}${Math.floor(Math.random() * 9000 + 1000)}`;

  try {
    const [user] = await db.insert(usersTable).values({
      username: String(username),
      telegramId: finalTelegramId,
      walletAddress: walletAddress ? String(walletAddress) : null,
      avatarUrl: avatarUrl ? String(avatarUrl) : null,
      referralCode,
    }).returning();
    res.status(201).json({ ...user, token: tokenFor(user) });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    throw err;
  }
});

router.get("/users/check-username/:username", async (req, res): Promise<void> => {
  const { username } = req.params;
  if (!username || username.length < 3 || username.length > 20) {
    res.json({ available: false, reason: "Username must be 3-20 characters" });
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    res.json({ available: false, reason: "Only letters, numbers, underscores" });
    return;
  }
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, username));
  res.json({ available: !existing });
});

router.get("/users/by-wallet/:walletAddress", async (req, res): Promise<void> => {
  const { walletAddress } = req.params;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.walletAddress, walletAddress));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ ...user, token: signSessionToken(user.id, "wallet") });
});

router.get("/users/by-telegram/:telegramId", async (req, res): Promise<void> => {
  const params = GetUserByTelegramParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, params.data.telegramId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

router.get("/users/:id/stats", async (req, res): Promise<void> => {
  const params = GetUserStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const responses = await db
    .select()
    .from(taskResponsesTable)
    .where(eq(taskResponsesTable.userId, params.data.id));

  const tasksCompleted = responses.length;
  const tasksCorrect = responses.filter((r) => r.isCorrect === true).length;
  const accuracyRate = tasksCompleted > 0 ? (tasksCorrect / tasksCompleted) * 100 : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyTasksDone = responses.filter(
    (r) => r.createdAt >= today,
  ).length;

  const [adsRecord] = await db
    .select()
    .from(adsTrackingTable)
    .where(eq(adsTrackingTable.userId, params.data.id));

  const currentEnergy = await applyPassiveEnergyRegen(user);

  res.json({
    userId: user.id,
    tasksCompleted,
    tasksCorrect,
    accuracyRate: Math.round(accuracyRate * 10) / 10,
    currentStreak: user.streak,
    energy: currentEnergy,
    maxEnergy: user.maxEnergy,
    xp: user.xp,
    level: user.level,
    points: user.points,
    adsWatchedToday: adsRecord?.adsWatchedToday ?? 0,
    dailyTasksDone,
  });
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

router.get("/users/:id/rewards", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const entries = await db
    .select()
    .from(rewardLedgerTable)
    .where(eq(rewardLedgerTable.userId, id))
    .orderBy(desc(rewardLedgerTable.createdAt))
    .limit(50);

  const totalTon = entries.reduce((sum, e) => sum + e.amountTon, 0);
  res.json({ entries, totalTon: Math.round(totalTon * 1e7) / 1e7 });
});

router.patch("/users/:id", requireSelf, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

export default router;
