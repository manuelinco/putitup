import { Router, type IRouter } from "express";
import { eq, count, and } from "drizzle-orm";
import { db, usersTable, taskResponsesTable } from "@workspace/db";

const router: IRouter = Router();

function generateCode(username: string): string {
  const base = username.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4).padEnd(4, "X");
  const suffix = Math.floor(Math.random() * 9000 + 1000);
  return `${base}${suffix}`;
}

router.post("/referral/apply", async (req, res): Promise<void> => {
  const { userId, referralCode } = req.body ?? {};
  const uid = Number(userId);
  if (!Number.isFinite(uid) || !referralCode) {
    res.status(400).json({ error: "userId and referralCode are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.referredBy !== null) {
    res.status(400).json({ error: "User already has a referral applied" });
    return;
  }

  const [referrer] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.referralCode, String(referralCode).toUpperCase()));

  if (!referrer) {
    res.status(404).json({ error: "Referral code not found" });
    return;
  }
  if (referrer.id === uid) {
    res.status(400).json({ error: "Cannot refer yourself" });
    return;
  }

  await db
    .update(usersTable)
    .set({ referredBy: referrer.id })
    .where(eq(usersTable.id, uid));

  res.json({ success: true, referrerId: referrer.id, referrerUsername: referrer.username });
});

router.get("/referral/stats/:userId", async (req, res): Promise<void> => {
  const uid = Number(req.params.userId);
  if (!Number.isFinite(uid)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const referrals = await db
    .select({ id: usersTable.id, username: usersTable.username, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.referredBy, uid));

  const referralWithProgress = await Promise.all(
    referrals.map(async (r) => {
      const [resp] = await db
        .select({ count: count() })
        .from(taskResponsesTable)
        .where(eq(taskResponsesTable.userId, r.id));
      const tasksCompleted = resp?.count ?? 0;
      return { ...r, tasksCompleted, bonusEarned: tasksCompleted >= 10 };
    })
  );

  res.json({
    referralCode: user.referralCode,
    referralCount: user.referralCount,
    referralBonusEarned: user.referralBonusEarned,
    referrals: referralWithProgress,
  });
});

router.post("/referral/check-bonus/:userId", async (req, res): Promise<void> => {
  const uid = Number(req.params.userId);
  if (!Number.isFinite(uid)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const referrals = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.referredBy, uid));

  let bonusGranted = 0;
  for (const r of referrals) {
    const [resp] = await db
      .select({ count: count() })
      .from(taskResponsesTable)
      .where(eq(taskResponsesTable.userId, r.id));
    const tasksCompleted = resp?.count ?? 0;
    if (tasksCompleted >= 10) {
      bonusGranted++;
    }
  }

  const newBonus = Math.max(bonusGranted * 500 - user.referralBonusEarned, 0);
  if (newBonus > 0) {
    await db.update(usersTable).set({
      points: user.points + newBonus,
      referralBonusEarned: user.referralBonusEarned + newBonus,
      referralCount: bonusGranted,
    }).where(eq(usersTable.id, uid));
  }

  res.json({ bonusGranted: newBonus, totalBonusEarned: user.referralBonusEarned + newBonus });
});

export default router;
