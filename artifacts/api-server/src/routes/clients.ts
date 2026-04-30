import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable, datasetsTable, datasetAccessTable } from "@workspace/db";
import { pbkdf2Sync, randomBytes } from "crypto";

const router: IRouter = Router();
const TOKENS_PER_AD = 2;
const CLIENT_DAILY_AD_CAP = 30;
const AD_COOLDOWN_MS = 30_000;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const verify = pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return hash === verify;
}

router.post("/clients/login", async (req, res): Promise<void> => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.email, String(email).trim().toLowerCase()));

  if (!client || !client.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!verifyPassword(String(password), client.passwordHash)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const { passwordHash: _ph, ...safeClient } = client;
  res.json({ client: safeClient });
});

router.post("/clients/set-password", async (req, res): Promise<void> => {
  const adminUser = process.env["ADMIN_USERNAME"];
  const adminPass = process.env["ADMIN_PASSWORD"];
  const { adminUsername, adminPassword, email, password } = req.body ?? {};

  if (adminUsername !== adminUser || adminPassword !== adminPass) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.email, String(email).trim().toLowerCase()));

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const passwordHash = hashPassword(String(password));
  await db
    .update(clientsTable)
    .set({ passwordHash })
    .where(eq(clientsTable.id, client.id));

  res.json({ ok: true });
});

router.post("/clients", async (req, res): Promise<void> => {
  const { firstName, lastName, email, phone, address, company, walletAddress } = req.body ?? {};

  if (!firstName || !lastName || !email || !phone || !address) {
    res.status(400).json({ error: "firstName, lastName, email, phone and address are required" });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const [existing] = await db.select().from(clientsTable).where(eq(clientsTable.email, normalizedEmail));

  if (existing) {
    const [updated] = await db
      .update(clientsTable)
      .set({
        firstName: String(firstName),
        lastName: String(lastName),
        phone: String(phone),
        address: String(address),
        company: company ? String(company) : null,
        walletAddress: walletAddress ? String(walletAddress) : existing.walletAddress,
      })
      .where(eq(clientsTable.id, existing.id))
      .returning();
    res.json(updated);
    return;
  }

  const [client] = await db.insert(clientsTable).values({
    firstName: String(firstName),
    lastName: String(lastName),
    email: normalizedEmail,
    phone: String(phone),
    address: String(address),
    company: company ? String(company) : null,
    walletAddress: walletAddress ? String(walletAddress) : null,
  }).returning();

  res.status(201).json(client);
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(client);
});

router.post("/clients/:id/ads/watch", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { datasetId, durationSeconds, completionToken } = req.body ?? {};
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  if (client.isBlocked) {
    res.status(403).json({ error: "Client blocked by anti-bot system" });
    return;
  }

  const now = new Date();
  const lastReset = new Date(client.lastAdResetAt);
  const isNewDay = now.toDateString() !== lastReset.toDateString();
  const adsWatchedToday = isNewDay ? 0 : client.adsWatchedToday;
  const lastAdAt = client.lastAdAt ? new Date(client.lastAdAt).getTime() : 0;
  const seconds = Number(durationSeconds ?? 0);
  const completed = typeof completionToken === "string" && completionToken.length >= 8 && seconds >= 15;
  const tooFast = lastAdAt > 0 && now.getTime() - lastAdAt < AD_COOLDOWN_MS;
  const capReached = adsWatchedToday >= CLIENT_DAILY_AD_CAP;
  const suspicious = !completed || tooFast || capReached;
  const riskDelta = suspicious ? (!completed ? 20 : tooFast ? 15 : 10) : -2;
  const nextRisk = Math.max(0, client.riskScore + riskDelta);

  if (suspicious) {
    const [updated] = await db.update(clientsTable).set({
      riskScore: nextRisk,
      isBlocked: nextRisk >= 100,
      lastAdResetAt: isNewDay ? now : client.lastAdResetAt,
      adsWatchedToday,
    }).where(eq(clientsTable.id, id)).returning();
    res.status(429).json({ success: false, reason: capReached ? "daily_cap" : tooFast ? "cooldown" : "invalid_completion", client: updated });
    return;
  }

  const [updated] = await db.update(clientsTable).set({
    tokenBalance: client.tokenBalance + TOKENS_PER_AD,
    adsWatchedToday: adsWatchedToday + 1,
    totalAdsWatched: client.totalAdsWatched + 1,
    riskScore: nextRisk,
    lastAdAt: now,
    lastAdResetAt: isNewDay ? now : client.lastAdResetAt,
  }).where(eq(clientsTable.id, id)).returning();

  res.json({ success: true, tokensEarned: TOKENS_PER_AD, datasetId: datasetId ?? null, client: updated });
});

router.post("/clients/:clientId/datasets/:datasetId/unlock", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  const datasetId = Number(req.params.datasetId);
  const method = String(req.body?.method ?? "tokens");

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  const [dataset] = await db.select().from(datasetsTable).where(eq(datasetsTable.id, datasetId));

  if (!client || !dataset) {
    res.status(404).json({ error: "Client or dataset not found" });
    return;
  }
  if (client.isBlocked || client.riskScore >= 100) {
    res.status(403).json({ error: "Download blocked by anti-bot system" });
    return;
  }

  const tokenCost = dataset.tokenCost || dataset.adsRequired || 0;
  if (method === "tokens") {
    if (client.tokenBalance < tokenCost) {
      res.status(402).json({ error: "Not enough tokens", tokenCost, tokenBalance: client.tokenBalance });
      return;
    }
    await db.update(clientsTable).set({ tokenBalance: client.tokenBalance - tokenCost }).where(eq(clientsTable.id, clientId));
  }

  const [access] = await db.insert(datasetAccessTable).values({
    clientId,
    datasetId,
    method,
    tokensSpent: method === "tokens" ? tokenCost : 0,
    amountPaidCents: method === "payment" ? Math.round((dataset.price ?? 0) * 100) : 0,
    status: "granted",
  }).returning();

  const [updatedDataset] = await db.update(datasetsTable).set({ downloadCount: dataset.downloadCount + 1 }).where(eq(datasetsTable.id, datasetId)).returning();

  res.json({ access, dataset: updatedDataset });
});

export default router;
