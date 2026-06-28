import { Router, type IRouter } from "express";
import { eq, desc, count, sql } from "drizzle-orm";
import { db, clientsTable, datasetsTable, datasetAccessTable, clientSessionsTable, contactMessagesTable } from "@workspace/db";
import { pbkdf2Sync, randomBytes, createHmac, timingSafeEqual } from "crypto";
import { verifyAdChallengeToken } from "../lib/adChallenge";
import { requireAdmin } from "../middleware/requireAdmin";

const SESSION_SECRET = (() => {
  const s = process.env["SESSION_SECRET"];
  if (!s) throw new Error("SESSION_SECRET env var is required");
  return s;
})();
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

function generateSessionToken(clientId: number): string {
  const rand = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", SESSION_SECRET).update(`${clientId}:${rand}`).digest("hex");
  return `${clientId}.${rand}.${sig}`;
}

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
  try {
    return timingSafeEqual(Buffer.from(verify, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
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

  if (!client) {
    res.status(401).json({ error: "Email o password non corretti" });
    return;
  }

  // Account exists but was created without a password (e.g. via the email-code
  // flow). Tell the user exactly how to get in instead of a generic error.
  if (!client.passwordHash) {
    res.status(403).json({
      error: "Questo account non ha una password. Accedi con il codice via email.",
      code: "no_password",
    });
    return;
  }

  if (client.isBlocked) {
    res.status(403).json({ error: "Account bloccato. Contatta il supporto." });
    return;
  }

  if (!verifyPassword(String(password), client.passwordHash)) {
    res.status(401).json({ error: "Email o password non corretti" });
    return;
  }

  const token = generateSessionToken(client.id);
  const sessionExpiry = new Date(Date.now() + SESSION_EXPIRY_MS);
  await db.insert(clientSessionsTable).values({
    clientId: client.id,
    token,
    expiresAt: sessionExpiry,
    userAgent: req.headers["user-agent"] ?? null,
    ipAddress: String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown").split(",")[0]!.trim(),
  });
  const { passwordHash: _ph, ...safeClient } = client;
  res.json({ ok: true, token, client: safeClient });
});

router.post("/clients/set-password", async (req, res): Promise<void> => {
  const adminUser = process.env["ADMIN_USERNAME"];
  const adminPass = process.env["ADMIN_PASSWORD"];
  const { adminUsername, adminPassword, email, password } = req.body ?? {};

  let usernameOk = false;
  let passwordOk = false;
  try {
    const uBuf = Buffer.from(String(adminUsername ?? ""));
    const uRef = Buffer.from(adminUser ?? "");
    const pBuf = Buffer.from(String(adminPassword ?? ""));
    const pRef = Buffer.from(adminPass ?? "");
    if (uBuf.length === uRef.length) usernameOk = timingSafeEqual(uBuf, uRef);
    if (pBuf.length === pRef.length) passwordOk = timingSafeEqual(pBuf, pRef);
  } catch {}
  if (!usernameOk || !passwordOk) {
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

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/clients/register", async (req, res): Promise<void> => {
  const { name, company, email, password } = req.body ?? {};
  if (!name || !email || !password) {
    res.status(400).json({ error: "name, email and password are required" });
    return;
  }
  if (!EMAIL_REGEX.test(String(email))) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }
  if (!PASSWORD_REGEX.test(String(password))) {
    res.status(400).json({ error: "Password must be at least 8 characters with uppercase, lowercase, and a number" });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const [existing] = await db.select().from(clientsTable).where(eq(clientsTable.email, normalizedEmail));
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }
  const nameParts = String(name).trim().split(/\s+/);
  const firstName = nameParts[0] ?? "User";
  const lastName = nameParts.slice(1).join(" ") || "-";
  const passwordHash = hashPassword(String(password));
  const [client] = await db.insert(clientsTable).values({
    firstName,
    lastName,
    email: normalizedEmail,
    phone: "—",
    address: "—",
    company: company ? String(company) : null,
    passwordHash,
    tokenBalance: 5,
  }).returning();
  const { passwordHash: _ph, ...safeClient } = client;
  res.status(201).json({ client: safeClient });
});

// PUBLIC — real platform aggregates for the marketing landing page.
// Registered BEFORE the `/clients/:id` route so "public-stats" is not treated
// as a client id.
router.get("/clients/public-stats", async (_req, res): Promise<void> => {
  let validatedRecords = 0;
  let totalDatasets = 0;
  let totalClients = 0;

  try {
    const [r] = await db
      .select({ n: sql<number>`coalesce(sum(${datasetsTable.recordCount}), 0)::int` })
      .from(datasetsTable)
      .where(eq(datasetsTable.status, "active"));
    validatedRecords = Number(r?.n ?? 0);
  } catch {}

  try {
    const [r] = await db
      .select({ n: count() })
      .from(datasetsTable)
      .where(eq(datasetsTable.status, "active"));
    totalDatasets = Number(r?.n ?? 0);
  } catch {}

  try {
    const [r] = await db.select({ n: count() }).from(clientsTable);
    totalClients = Number(r?.n ?? 0);
  } catch {}

  res.json({ validatedRecords, totalDatasets, totalClients });
});

// ADMIN — list business clients (most recent first).
router.get("/clients/admin/list", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: clientsTable.id,
      firstName: clientsTable.firstName,
      lastName: clientsTable.lastName,
      email: clientsTable.email,
      company: clientsTable.company,
      plan: clientsTable.plan,
      tokenBalance: clientsTable.tokenBalance,
      isBlocked: clientsTable.isBlocked,
      createdAt: clientsTable.createdAt,
    })
    .from(clientsTable)
    .orderBy(desc(clientsTable.createdAt))
    .limit(500);
  res.json(rows);
});

// ADMIN — list contact-form submissions (most recent first).
router.get("/clients/admin/contact-messages", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(contactMessagesTable)
    .orderBy(desc(contactMessagesTable.createdAt))
    .limit(200);
  res.json(rows);
});

// ADMIN — dataset access / sales ledger with client + dataset labels.
router.get("/clients/admin/sales", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: datasetAccessTable.id,
      method: datasetAccessTable.method,
      tokensSpent: datasetAccessTable.tokensSpent,
      amountPaidCents: datasetAccessTable.amountPaidCents,
      status: datasetAccessTable.status,
      createdAt: datasetAccessTable.createdAt,
      clientEmail: clientsTable.email,
      clientCompany: clientsTable.company,
      datasetName: datasetsTable.name,
    })
    .from(datasetAccessTable)
    .leftJoin(clientsTable, eq(datasetAccessTable.clientId, clientsTable.id))
    .leftJoin(datasetsTable, eq(datasetAccessTable.datasetId, datasetsTable.id))
    .orderBy(desc(datasetAccessTable.createdAt))
    .limit(200);
  res.json(rows);
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

router.get("/clients/:id/datasets", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }
  const rows = await db
    .select({
      accessId: datasetAccessTable.id,
      datasetId: datasetAccessTable.datasetId,
      method: datasetAccessTable.method,
      tokensSpent: datasetAccessTable.tokensSpent,
      createdAt: datasetAccessTable.createdAt,
      dsId: datasetsTable.id,
      dsName: datasetsTable.name,
      dsDescription: datasetsTable.description,
      dsCategory: datasetsTable.category,
      dsQualityScore: datasetsTable.qualityScore,
      dsRecordCount: datasetsTable.recordCount,
      dsStatus: datasetsTable.status,
    })
    .from(datasetAccessTable)
    .leftJoin(datasetsTable, eq(datasetAccessTable.datasetId, datasetsTable.id))
    .where(eq(datasetAccessTable.clientId, id));

  const accesses = rows.map((r) => ({
    id: r.accessId,
    datasetId: r.datasetId,
    method: r.method,
    tokensSpent: r.tokensSpent,
    grantedAt: r.createdAt,
    dataset: r.dsId != null ? {
      id: r.dsId,
      name: r.dsName,
      description: r.dsDescription,
      category: r.dsCategory,
      qualityScore: r.dsQualityScore,
      recordCount: r.dsRecordCount,
      status: r.dsStatus,
    } : null,
  }));

  res.json(accesses);
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
  const tokenValid = verifyAdChallengeToken(completionToken, "client", id).valid;
  const completed = tokenValid && seconds >= 15;
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
