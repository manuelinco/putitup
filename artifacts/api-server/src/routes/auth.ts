import { Router, type IRouter } from "express";
import crypto from "crypto";

const router: IRouter = Router();

interface UsedEntry { expiresAt: number }
const usedInitDataHashes = new Map<string, UsedEntry>();
const HASH_TTL_MS = 86_400_000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of usedInitDataHashes) {
    if (entry.expiresAt < now) usedInitDataHashes.delete(key);
  }
}, 300_000).unref();

/**
 * POST /api/auth/telegram/validate
 * Validates Telegram WebApp initData via HMAC-SHA256.
 * Also enforces replay protection: each initData hash can only be used once per 24h window.
 */
router.post("/auth/telegram/validate", async (req, res): Promise<void> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    res.json({ valid: false, reason: "bot_token_not_configured" });
    return;
  }

  const { initData } = req.body ?? {};
  if (!initData || typeof initData !== "string") {
    res.status(400).json({ valid: false, error: "initData is required" });
    return;
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) {
      res.json({ valid: false, reason: "no_hash" });
      return;
    }

    params.delete("hash");
    const checkString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const expectedHashBuf = crypto
      .createHmac("sha256", secretKey)
      .update(checkString)
      .digest("hex");

    let hashMatch = false;
    try {
      hashMatch = crypto.timingSafeEqual(
        Buffer.from(expectedHashBuf, "utf8"),
        Buffer.from(hash, "utf8"),
      );
    } catch {}

    if (!hashMatch) {
      res.json({ valid: false, reason: "hash_mismatch" });
      return;
    }

    const authDate = Number(params.get("auth_date") ?? 0);
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - authDate > 86400) {
      res.json({ valid: false, reason: "expired" });
      return;
    }

    const replayKey = `${hash}`;
    if (usedInitDataHashes.has(replayKey)) {
      res.json({ valid: false, reason: "replay_detected" });
      return;
    }
    usedInitDataHashes.set(replayKey, { expiresAt: Date.now() + HASH_TTL_MS });

    const userStr = params.get("user");
    const user = userStr ? JSON.parse(userStr) : null;
    res.json({ valid: true, user });
  } catch {
    res.status(400).json({ valid: false, reason: "parse_error" });
  }
});

/**
 * POST /api/auth/ads/challenge
 * Issues a server-signed challenge token for ad watching.
 * Body: { clientId: number }
 * Returns: { challengeToken: string, expiresAt: number }
 */
// Usa SESSION_SECRET obbligatoriamente — nessun fallback hardcoded
const AD_CHALLENGE_SECRET = (() => {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET env var is required");
  return s;
})();
const AD_CHALLENGE_TTL_MS = 120_000;

router.post("/auth/ads/challenge", async (req, res): Promise<void> => {
  const { clientId } = req.body ?? {};
  const id = Number(clientId);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "clientId is required" });
    return;
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const issuedAt = Date.now();
  const payload = `${id}:${nonce}:${issuedAt}`;
  const sig = crypto.createHmac("sha256", AD_CHALLENGE_SECRET).update(payload).digest("hex");
  const challengeToken = `${payload}.${sig}`;
  const expiresAt = issuedAt + AD_CHALLENGE_TTL_MS;

  res.json({ challengeToken, expiresAt });
});

/**
 * Verify a challenge token issued by /auth/ads/challenge.
 * Returns clientId if valid, null otherwise.
 */
export function verifyAdChallengeToken(token: string, clientId: number): boolean {
  try {
    const lastDot = token.lastIndexOf(".");
    if (lastDot === -1) return false;
    const payload = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    const parts = payload.split(":");
    if (parts.length !== 3) return false;
    const [payloadClientId, , issuedAtStr] = parts;
    if (Number(payloadClientId) !== clientId) return false;
    const issuedAt = Number(issuedAtStr);
    if (Date.now() - issuedAt > AD_CHALLENGE_TTL_MS) return false;
    const expectedSig = crypto.createHmac("sha256", AD_CHALLENGE_SECRET).update(payload).digest("hex");
    const sigBuf = Buffer.from(sig, "utf8");
    const expBuf = Buffer.from(expectedSig, "utf8");
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export default router;
