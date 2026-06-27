import crypto from "crypto";

/**
 * Mini App session token (HMAC-SHA256, signed with SESSION_SECRET).
 *
 * Format (before base64url): `userId:source:exp:nonce.signature`
 * The token is bound to a resolved DB userId so subsequent requests no longer
 * trust a client-provided integer id (closes the sequential-id IDOR).
 */

const SESSION_SECRET = (() => {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET env var is required");
  return s;
})();

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type SessionSource = "telegram" | "wallet";

export interface SessionClaims {
  userId: number;
  source: SessionSource;
  exp: number;
}

export function signSessionToken(
  userId: number,
  source: SessionSource,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const exp = Date.now() + ttlMs;
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `${userId}:${source}:${exp}:${nonce}`;
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`, "utf8").toString("base64url");
}

export function verifySessionToken(token: string): SessionClaims | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return null;

    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const parts = payload.split(":");
    if (parts.length !== 4) return null;

    const [userIdStr, source, expStr] = parts;

    const expectedSig = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(payload)
      .digest("hex");

    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expectedSig, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return null;

    const userId = Number(userIdStr);
    if (!Number.isFinite(userId) || userId <= 0) return null;

    if (source !== "telegram" && source !== "wallet") return null;

    return { userId, source, exp };
  } catch {
    return null;
  }
}
