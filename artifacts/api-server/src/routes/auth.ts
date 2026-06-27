import { Router, type IRouter } from "express";
import { eq, lt } from "drizzle-orm";
import { db, usersTable, usedInitDataTable } from "@workspace/db";
import { signSessionToken } from "../lib/sessionToken";
import { verifyTelegramInitData } from "../lib/telegramAuth";
import { requireUser } from "../middleware/requireUser";
import { signAdChallengeToken } from "../lib/adChallenge";

// Re-exported for existing importers; canonical impl lives in ../lib/adChallenge.
export { verifyAdChallengeToken } from "../lib/adChallenge";

const router: IRouter = Router();

const HASH_TTL_MS = 86_400_000;

// Best-effort purge of expired replay records.
setInterval(() => {
  db.delete(usedInitDataTable)
    .where(lt(usedInitDataTable.expiresAt, new Date()))
    .catch(() => {});
}, 3_600_000).unref();

/**
 * POST /api/auth/telegram/validate
 * Validates Telegram WebApp initData via HMAC-SHA256.
 * Also enforces replay protection: each initData hash can only be used once per 24h window.
 */
router.post("/auth/telegram/validate", async (req, res): Promise<void> => {
  const { initData } = req.body ?? {};
  if (!initData || typeof initData !== "string") {
    res.status(400).json({ valid: false, error: "initData is required" });
    return;
  }

  const verified = verifyTelegramInitData(initData);
  if (!verified.ok) {
    // parse_error is a malformed payload → 400; every other failure is an
    // expected "not valid" outcome reported with 200 + reason (legacy contract).
    if (verified.reason === "parse_error") {
      res.status(400).json({ valid: false, reason: "parse_error" });
      return;
    }
    res.json({ valid: false, reason: verified.reason });
    return;
  }

  // Replay protection: each signed initData hash is single-use within its TTL.
  const inserted = await db
    .insert(usedInitDataTable)
    .values({ hash: verified.hash!, expiresAt: new Date(Date.now() + HASH_TTL_MS) })
    .onConflictDoNothing()
    .returning({ hash: usedInitDataTable.hash });
  if (inserted.length === 0) {
    res.json({ valid: false, reason: "replay_detected" });
    return;
  }

  // Resolve the signed-in DB user (if registered) and mint a session token
  // bound to their real id. New users get telegramUser only and register next.
  let dbUser: typeof usersTable.$inferSelect | null = null;
  let token: string | undefined;
  if (verified.telegramId) {
    const [found] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.telegramId, verified.telegramId));
    if (found) {
      dbUser = found;
      token = signSessionToken(found.id, "telegram");
    }
  }

  res.json({ valid: true, user: dbUser, telegramUser: verified.tgUser, token });
});

/**
 * POST /api/auth/ads/challenge
 * Issues a server-signed challenge token for ad watching.
 * Body: { clientId: number }
 * Returns: { challengeToken: string, expiresAt: number }
 */
router.post("/auth/ads/challenge", async (req, res): Promise<void> => {
  const { clientId } = req.body ?? {};
  const id = Number(clientId);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "clientId is required" });
    return;
  }
  res.json(signAdChallengeToken("client", id));
});

/**
 * GET /api/auth/session/me
 * Returns the authenticated user resolved from the signed session token.
 */
router.get("/auth/session/me", requireUser, async (req, res): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

export default router;
