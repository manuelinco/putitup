import crypto from "crypto";

/**
 * Shared anti-bot ad-challenge token helpers.
 *
 * A challenge token is issued right after the user passes the red-dot human
 * check and BEFORE a rewarded ad is shown. It is then sent back with the
 * /ads/watch (users) or /clients/:id/ads/watch (business) call to prove the
 * watch was preceded by a real human interaction.
 *
 * Token format: `audience:id:nonce:issuedAt.signature`
 *   - audience: "user" | "client" — prevents a token minted for one namespace
 *     from being replayed against the other when ids happen to collide.
 *   - signature: HMAC-SHA256(SESSION_SECRET) over the `audience:id:nonce:issuedAt` payload.
 *
 * Legacy tokens (`id:nonce:issuedAt.signature`, 3 parts, no audience) are still
 * accepted and treated as audience "client" for backward compatibility with any
 * tokens minted right before this change rolled out (they expire within 120s).
 */

export type AdAudience = "user" | "client";

export const AD_CHALLENGE_TTL_MS = 120_000;

const AD_CHALLENGE_SECRET = (() => {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET env var is required");
  return s;
})();

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", AD_CHALLENGE_SECRET)
    .update(payload)
    .digest("hex");
}

export function signAdChallengeToken(
  audience: AdAudience,
  id: number,
): { challengeToken: string; expiresAt: number } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const issuedAt = Date.now();
  const payload = `${audience}:${id}:${nonce}:${issuedAt}`;
  const challengeToken = `${payload}.${sign(payload)}`;
  return { challengeToken, expiresAt: issuedAt + AD_CHALLENGE_TTL_MS };
}

/**
 * Verify a challenge token for the given audience + id.
 * Returns { valid, issuedAt } so callers can derive the elapsed watch time
 * directly from the signed token (tamper-resistant) instead of trusting a
 * client-reported duration.
 */
export function verifyAdChallengeToken(
  token: unknown,
  audience: AdAudience,
  id: number,
): { valid: boolean; issuedAt: number | null } {
  const fail = { valid: false, issuedAt: null };
  try {
    if (typeof token !== "string") return fail;
    const lastDot = token.lastIndexOf(".");
    if (lastDot === -1) return fail;
    const payload = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    const parts = payload.split(":");

    let tokenAudience: AdAudience;
    let tokenId: string;
    let issuedAtStr: string;
    if (parts.length === 4) {
      [tokenAudience, tokenId, , issuedAtStr] = parts as [
        AdAudience,
        string,
        string,
        string,
      ];
    } else if (parts.length === 3) {
      // Legacy format without audience — only ever used by clients.
      tokenAudience = "client";
      [tokenId, , issuedAtStr] = parts as [string, string, string];
    } else {
      return fail;
    }

    if (tokenAudience !== audience) return fail;
    if (Number(tokenId) !== id) return fail;

    const issuedAt = Number(issuedAtStr);
    if (!Number.isFinite(issuedAt)) return fail;
    if (Date.now() - issuedAt > AD_CHALLENGE_TTL_MS) return fail;

    const expectedSig = sign(payload);
    const sigBuf = Buffer.from(sig, "utf8");
    const expBuf = Buffer.from(expectedSig, "utf8");
    if (sigBuf.length !== expBuf.length) return fail;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return fail;

    return { valid: true, issuedAt };
  } catch {
    return fail;
  }
}
