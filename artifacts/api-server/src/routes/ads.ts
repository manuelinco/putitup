import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, adsTrackingTable, usersTable } from "@workspace/db";
import {
  WatchAdBody,
  GetAdTrackingParams,
} from "@workspace/api-zod";

const DAILY_AD_CAP = 20;
const ENERGY_PER_AD = 20;
const POINTS_PER_AD = 5;

const router: IRouter = Router();

router.post("/ads/watch", async (req, res): Promise<void> => {
  const parsed = WatchAdBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId, adType } = parsed.data;

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
  } else {
    const lastReset = new Date(adsRecord.lastResetDate);
    const isNewDay =
      now.toDateString() !== lastReset.toDateString();

    if (isNewDay) {
      const [reset] = await db
        .update(adsTrackingTable)
        .set({ adsWatchedToday: 0, lastResetDate: now })
        .where(eq(adsTrackingTable.userId, userId))
        .returning();
      adsRecord = reset;
    }
  }

  if (adsRecord.adsWatchedToday >= DAILY_AD_CAP) {
    res.json({
      success: false,
      energyRestored: 0,
      pointsEarned: 0,
      datasetUnlocked: false,
      adsWatchedToday: adsRecord.adsWatchedToday,
      dailyCapReached: true,
    });
    return;
  }

  const [updatedAds] = await db
    .update(adsTrackingTable)
    .set({
      adsWatchedToday: adsRecord.adsWatchedToday + 1,
      totalAdsWatched: adsRecord.totalAdsWatched + 1,
      lastViewTime: now,
    })
    .where(eq(adsTrackingTable.userId, userId))
    .returning();

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
  });
});

router.get("/ads/tracking/:userId", async (req, res): Promise<void> => {
  const params = GetAdTrackingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
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
