import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, gt, lt } from "drizzle-orm";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { db, clientsTable, clientOtpCodesTable, clientSessionsTable } from "@workspace/db";
import { sendOtpEmail } from "../lib/email";

const router: IRouter = Router();

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_MS = 60 * 1000;
const SESSION_SECRET = process.env["SESSION_SECRET"] ?? "putitup-session-secret";

function generateOtp(): string {
  const n = parseInt(randomBytes(3).toString("hex"), 16) % 1000000;
  return String(n).padStart(6, "0");
}

function generateSessionToken(clientId: number): string {
  const rand = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", SESSION_SECRET).update(`${clientId}:${rand}`).digest("hex");
  return `${clientId}.${rand}.${sig}`;
}

function verifySessionToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [idStr, rand, sig] = parts;
  const clientId = Number(idStr);
  if (!Number.isFinite(clientId)) return null;
  const expected = createHmac("sha256", SESSION_SECRET).update(`${clientId}:${rand}`).digest("hex");
  try {
    if (timingSafeEqual(Buffer.from(sig!, "hex"), Buffer.from(expected, "hex"))) return clientId;
  } catch {}
  return null;
}

function getIp(req: Request): string {
  return String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown").split(",")[0]!.trim();
}

router.post("/auth/otp/send", async (req: Request, res: Response): Promise<void> => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Email non valida" });
    return;
  }

  // Block registration if email already exists
  const [existingClient] = await db
    .select({ id: clientsTable.id, email: clientsTable.email, firstName: clientsTable.firstName })
    .from(clientsTable)
    .where(eq(clientsTable.email, email));

  if (existingClient) {
    res.status(409).json({ error: "Questa email è già registrata. Accedi dalla pagina di login." });
    return;
  }

  const now = new Date();

  const recentOtps = await db
    .select()
    .from(clientOtpCodesTable)
    .where(
      and(
        eq(clientOtpCodesTable.email, email),
        gt(clientOtpCodesTable.createdAt, new Date(now.getTime() - RATE_LIMIT_MS)),
      )
    );

  if (recentOtps.length >= 3) {
    res.status(429).json({ error: "Troppe richieste. Attendi 1 minuto prima di richiedere un nuovo codice." });
    return;
  }

  const code = generateOtp();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);

  await db.insert(clientOtpCodesTable).values({
    email,
    code,
    expiresAt,
    ipAddress: getIp(req),
  });

  let devCode: string | undefined;
  try {
    const result = await sendOtpEmail(email, code, true);
    if (result.devCode) devCode = result.devCode;
  } catch (err: any) {
    res.status(500).json({ error: "Errore invio email. Riprova tra qualche istante." });
    return;
  }

  res.json({
    ok: true,
    message: devCode
      ? `[DEV] Email non inviata — codice: ${devCode}`
      : `Codice inviato a ${email}`,
    ...(devCode ? { devCode } : {}),
  });
});

router.post("/auth/otp/verify", async (req: Request, res: Response): Promise<void> => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const code = String(req.body?.code ?? "").trim();

  if (!email || !code) {
    res.status(400).json({ error: "Email e codice sono obbligatori" });
    return;
  }

  const now = new Date();

  const [otp] = await db
    .select()
    .from(clientOtpCodesTable)
    .where(
      and(
        eq(clientOtpCodesTable.email, email),
        eq(clientOtpCodesTable.code, code),
        eq(clientOtpCodesTable.used, false),
        gt(clientOtpCodesTable.expiresAt, now),
      )
    )
    .orderBy(clientOtpCodesTable.createdAt)
    .limit(1);

  if (!otp) {
    const [anyOtp] = await db
      .select()
      .from(clientOtpCodesTable)
      .where(
        and(
          eq(clientOtpCodesTable.email, email),
          eq(clientOtpCodesTable.used, false),
          gt(clientOtpCodesTable.expiresAt, now),
        )
      )
      .limit(1);

    if (anyOtp) {
      const newAttempts = (anyOtp.attempts ?? 0) + 1;
      await db
        .update(clientOtpCodesTable)
        .set({ attempts: newAttempts, used: newAttempts >= MAX_ATTEMPTS })
        .where(eq(clientOtpCodesTable.id, anyOtp.id));

      if (newAttempts >= MAX_ATTEMPTS) {
        res.status(401).json({ error: "Troppi tentativi errati. Richiedi un nuovo codice." });
        return;
      }
      res.status(401).json({ error: `Codice errato. ${MAX_ATTEMPTS - newAttempts} tentativi rimanenti.` });
      return;
    }

    res.status(401).json({ error: "Codice non valido o scaduto. Richiedi un nuovo codice." });
    return;
  }

  await db.update(clientOtpCodesTable).set({ used: true }).where(eq(clientOtpCodesTable.id, otp.id));

  // OTP verified — always a new user at this point (existing users blocked at /send)
  res.json({ ok: true, isNewUser: true, email });
});

router.post("/auth/otp/register", async (req: Request, res: Response): Promise<void> => {
  const {
    email, firstName, lastName, company, phone, plan,
    vatCode, address, postalCode, city,
  } = req.body ?? {};

  if (!email || !firstName || !lastName) {
    res.status(400).json({ error: "Nome, cognome ed email sono obbligatori" });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const verifiedOtp = await db
    .select()
    .from(clientOtpCodesTable)
    .where(
      and(
        eq(clientOtpCodesTable.email, normalizedEmail),
        eq(clientOtpCodesTable.used, true),
        gt(clientOtpCodesTable.expiresAt, new Date(Date.now() - 15 * 60 * 1000)),
      )
    )
    .orderBy(clientOtpCodesTable.createdAt)
    .limit(1);

  if (!verifiedOtp.length) {
    res.status(403).json({ error: "Sessione OTP scaduta. Ricomincia la registrazione." });
    return;
  }

  const [existing] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(eq(clientsTable.email, normalizedEmail));

  if (existing) {
    res.status(409).json({ error: "Account già esistente. Accedi dalla pagina di login." });
    return;
  }

  const [newClient] = await db
    .insert(clientsTable)
    .values({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: normalizedEmail,
      phone: String(phone ?? "").trim() || "—",
      address: String(address ?? "").trim() || "—",
      city: String(city ?? "").trim() || null,
      postalCode: String(postalCode ?? "").trim() || null,
      vatCode: String(vatCode ?? "").trim() || null,
      company: String(company ?? "").trim() || null,
    })
    .returning();

  if (!newClient) {
    res.status(500).json({ error: "Errore creazione account" });
    return;
  }

  const token = generateSessionToken(newClient.id);
  const sessionExpiry = new Date(Date.now() + SESSION_EXPIRY_MS);

  await db.insert(clientSessionsTable).values({
    clientId: newClient.id,
    token,
    expiresAt: sessionExpiry,
    userAgent: req.headers["user-agent"] ?? null,
    ipAddress: getIp(req),
  });

  const { passwordHash: _ph, ...safeClient } = newClient as any;
  res.json({ ok: true, token, client: safeClient, plan: String(plan ?? "free") });
});

router.get("/auth/client/me", async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers["authorization"] ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "Non autenticato" });
    return;
  }

  const clientId = verifySessionToken(token);
  if (!clientId) {
    res.status(401).json({ error: "Token non valido" });
    return;
  }

  const now = new Date();
  const [session] = await db
    .select()
    .from(clientSessionsTable)
    .where(
      and(
        eq(clientSessionsTable.token, token),
        gt(clientSessionsTable.expiresAt, now),
      )
    )
    .limit(1);

  if (!session) {
    res.status(401).json({ error: "Sessione scaduta. Accedi di nuovo." });
    return;
  }

  await db
    .delete(clientSessionsTable)
    .where(lt(clientSessionsTable.expiresAt, now));

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));

  if (!client || client.isBlocked) {
    res.status(403).json({ error: "Account non trovato o bloccato" });
    return;
  }

  const { passwordHash: _ph, ...safeClient } = client as any;
  res.json({ client: safeClient });
});

router.post("/auth/client/logout", async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers["authorization"] ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token) {
    await db.delete(clientSessionsTable).where(eq(clientSessionsTable.token, token));
  }
  res.json({ ok: true });
});

router.post("/auth/admin/login", (req: Request, res: Response): void => {
  const { username, password } = req.body ?? {};
  const adminUser = process.env["ADMIN_USERNAME"] ?? "";
  const adminPass = process.env["ADMIN_PASSWORD"] ?? "";

  if (!adminUser || !adminPass) {
    res.status(503).json({ error: "Admin not configured" });
    return;
  }

  let ok = false;
  try {
    const uBuf = Buffer.from(String(username ?? ""));
    const uRef = Buffer.from(adminUser);
    const pBuf = Buffer.from(String(password ?? ""));
    const pRef = Buffer.from(adminPass);
    ok = uBuf.length === uRef.length && pBuf.length === pRef.length
      && timingSafeEqual(uBuf, uRef) && timingSafeEqual(pBuf, pRef);
  } catch {}

  if (!ok) {
    res.status(401).json({ error: "Credenziali non valide" });
    return;
  }

  const token = generateSessionToken(0);
  res.json({ ok: true, token, role: "admin" });
});

router.get("/auth/admin/me", (req: Request, res: Response): void => {
  const authHeader = req.headers["authorization"] ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const clientId = verifySessionToken(token);
  if (clientId !== 0) {
    res.status(401).json({ error: "Non autenticato come admin" });
    return;
  }
  res.json({ ok: true, role: "admin" });
});

export default router;
