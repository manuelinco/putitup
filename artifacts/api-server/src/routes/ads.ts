import { Router, type IRouter } from "express";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db, adsTrackingTable, usersTable } from "@workspace/db";
import {
  WatchAdBody,
  GetAdTrackingParams,
} from "@workspace/api-zod";
import { requireUserStrict } from "../middleware/requireUser";
import { signAdChallengeToken, verifyAdChallengeToken } from "../lib/adChallenge";

const DAILY_AD_CAP = 20;
const ENERGY_PER_AD = 20;
const POINTS_PER_AD = 5;
const AD_COOLDOWN_MS = 30_000;
// Minimum elapsed time between issuing the challenge token (after the human
// check) and submitting the watch. Derived server-side from the signed token,
// so the client cannot fake it. Real Adsgram rewarded ads run well above this.
const MIN_AD_SECONDS = 10;
const RISK_BLOCK = 100;

// Antibot temporarily suspended per owner request: real Adsgram ads only.
// While suspended we skip the risk-score hard block + accumulation and the
// minimum-watch-duration gate, but KEEP the per-user cooldown, daily cap and
// single-use token check. Flip back to false to fully re-enable antibot.
const ANTIBOT_SUSPENDED = true;

const router: IRouter = Router();

/**
 * POST /api/ads/challenge
 * Issues a server-signed anti-bot token AFTER the red-dot human check and
 * BEFORE a rewarded ad is shown. The token is returned with /ads/watch to
 * prove a real human interaction preceded the watch.
 */
router.post("/ads/challenge", requireUserStrict, async (req, res): Promise<void> => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json(signAdChallengeToken("user", userId));
});

router.post("/ads/watch", requireUserStrict, async (req, res): Promise<void> => {
  const parsed = WatchAdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { adType, completionToken } = parsed.data;
  const userId = req.userId ?? parsed.data.userId;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  let adsRecord = (
    await db
      .select()
      .from(adsTrackingTable)
      .where(eq(adsTrackingTable.userId, userId))
  )[0];

  const now = new Date();

  if (!adsRecord) {
    const [created] = await db
      .insert(adsTrackingTable)
      .values({ userId, lastResetDate: now })
      .returning();
    adsRecord = created;
  }

  // Auto-block: a flagged user (risk >= 100) earns nothing until an admin resets them.
  if (!ANTIBOT_SUSPENDED && adsRecord.riskScore >= RISK_BLOCK) {
    res.json({
      success: false,
      reason: "blocked",
      blocked: true,
      riskScore: adsRecord.riskScore,
      energyRestored: 0,
      pointsEarned: 0,
      datasetUnlocked: false,
      adsWatchedToday: adsRecord.adsWatchedToday,
      dailyCapReached: adsRecord.adsWatchedToday >= DAILY_AD_CAP,
    });
    return;
  }

  // Daily reset.
  const lastReset = new Date(adsRecord.lastResetDate);
  const isNewDay = now.toDateString() !== lastReset.toDateString();
  const adsWatchedToday = isNewDay ? 0 : adsRecord.adsWatchedToday;

  // Anti-bot signals.
  const tokenResult = verifyAdChallengeToken(completionToken, "user", userId);
  const tokenIssuedMs = tokenResult.issuedAt ?? 0;
  const elapsedSec = tokenIssuedMs ? (now.getTime() - tokenIssuedMs) / 1000 : 0;

  const lastView = adsRecord.lastViewTime
    ? new Date(adsRecord.lastViewTime).getTime()
    : 0;
  const cooldownUntil = adsRecord.cooldownUntil
    ? new Date(adsRecord.cooldownUntil).getTime()
    : 0;

  // Single-use guard: a successful watch advances lastViewTime, so any token
  // issued at/before that instant has already been consumed (or is stockpiled).
  // A fresh challenge is always issued AFTER the previous reward, so its
  // issuedAt is strictly greater — this makes each token pay at most once.
  const freshToken = tokenIssuedMs > lastView;
  const completed = ANTIBOT_SUSPENDED
    ? tokenResult.valid && freshToken
    : tokenResult.valid && elapsedSec >= MIN_AD_SECONDS && freshToken;

  const tooFast =
    (lastView > 0 && now.getTime() - lastView < AD_COOLDOWN_MS) ||
    (cooldownUntil > 0 && now.getTime() < cooldownUntil);
  const capReached = adsWatchedToday >= DAILY_AD_CAP;

  const suspicious = !completed || tooFast || capReached;
  const riskDelta = ANTIBOT_SUSPENDED
    ? 0
    : suspicious ? (!completed ? 20 : tooFast ? 15 : 10) : -2;
  const nextRisk = Math.max(0, Math.min(RISK_BLOCK, adsRecord.riskScore + riskDelta));

  if (suspicious) {
    const [updated] = await db
      .update(adsTrackingTable)
      .set({
        riskScore: nextRisk,
        suspiciousCount: adsRecord.suspiciousCount + 1,
        cooldownUntil: new Date(now.getTime() + AD_COOLDOWN_MS),
        adsWatchedToday,
        lastResetDate: isNewDay ? now : adsRecord.lastResetDate,
      })
      .where(eq(adsTrackingTable.userId, userId))
      .returning();

    res.json({
      success: false,
      reason: capReached
        ? "daily_cap"
        : tooFast
          ? "cooldown"
          : "invalid_completion",
      blocked: nextRisk >= RISK_BLOCK,
      riskScore: nextRisk,
      energyRestored: 0,
      pointsEarned: 0,
      datasetUnlocked: false,
      adsWatchedToday: updated.adsWatchedToday,
      dailyCapReached: updated.adsWatchedToday >= DAILY_AD_CAP,
    });
    return;
  }

  // Legit watch — grant the reward. The single-use guard is enforced ATOMICALLY:
  // the UPDATE only matches while the stored lastViewTime is still older than the
  // token's issue time. Concurrent replays of the same token serialize on the row
  // lock and re-evaluate this predicate against the just-written lastViewTime, so
  // exactly one request wins and a token can never pay twice under a race.
  const tokenIssuedDate = new Date(tokenIssuedMs);
  const updatedRows = await db
    .update(adsTrackingTable)
    .set({
      adsWatchedToday: adsWatchedToday + 1,
      totalAdsWatched: adsRecord.totalAdsWatched + 1,
      riskScore: nextRisk,
      lastViewTime: now,
      cooldownUntil: new Date(now.getTime() + AD_COOLDOWN_MS),
      lastResetDate: isNewDay ? now : adsRecord.lastResetDate,
    })
    .where(
      and(
        eq(adsTrackingTable.userId, userId),
        or(
          isNull(adsTrackingTable.lastViewTime),
          lt(adsTrackingTable.lastViewTime, tokenIssuedDate),
        ),
      ),
    )
    .returning();

  if (updatedRows.length === 0) {
    // Lost the race: another concurrent request already consumed this token.
    res.json({
      success: false,
      reason: "invalid_completion",
      blocked: false,
      riskScore: adsRecord.riskScore,
      energyRestored: 0,
      pointsEarned: 0,
      datasetUnlocked: false,
      adsWatchedToday: adsRecord.adsWatchedToday,
      dailyCapReached: adsRecord.adsWatchedToday >= DAILY_AD_CAP,
    });
    return;
  }
  const updatedAds = updatedRows[0];

  const energyRestored = adType === "rewarded" ? ENERGY_PER_AD : 0;
  const newEnergy = Math.min(user.energy + energyRestored, user.maxEnergy);

  await db
    .update(usersTable)
    .set({
      energy: newEnergy,
      points: user.points + POINTS_PER_AD,
    })
    .where(eq(usersTable.id, userId));

  res.json({
    success: true,
    energyRestored,
    pointsEarned: POINTS_PER_AD,
    datasetUnlocked: adType === "unlock",
    adsWatchedToday: updatedAds.adsWatchedToday,
    dailyCapReached: updatedAds.adsWatchedToday >= DAILY_AD_CAP,
    riskScore: updatedAds.riskScore,
    blocked: false,
  });
});

router.get("/ads/tracking/:userId", requireUserStrict, async (req, res): Promise<void> => {
  const params = GetAdTrackingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Self or admin only — this exposes per-user behavioural data.
  if (req.userId !== params.data.userId) {
    const [requester] = await db
      .select({ isAdmin: usersTable.isAdmin })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId ?? -1));
    if (!requester?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const [adsRecord] = await db
    .select()
    .from(adsTrackingTable)
    .where(eq(adsTrackingTable.userId, params.data.userId));

  res.json({
    userId: params.data.userId,
    adsWatchedToday: adsRecord?.adsWatchedToday ?? 0,
    totalAdsWatched: adsRecord?.totalAdsWatched ?? 0,
    lastViewTime: adsRecord?.lastViewTime ?? null,
    dailyCap: DAILY_AD_CAP,
    dailyCapReached: (adsRecord?.adsWatchedToday ?? 0) >= DAILY_AD_CAP,
  });
});

export default router;
