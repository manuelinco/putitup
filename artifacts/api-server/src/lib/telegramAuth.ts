import crypto from "crypto";

/**
 * Result of verifying a Telegram WebApp `initData` string.
 *
 * `ok` is true only when the HMAC-SHA256 signature matches the bot token AND
 * the payload is within the freshness window. Verification proves the caller
 * controls the `telegramId` it carries (the signature cannot be forged without
 * the bot token), so it is the ONLY trustworthy source of a Telegram identity.
 *
 * NOTE: this helper does NOT consume the replay store — it only verifies the
 * signature. Replay protection (single-use per 24h) is applied separately by
 * `/auth/telegram/validate`, so the same signed initData can be re-verified
 * during the immediately-following registration call without being rejected.
 */
export interface TelegramInitDataResult {
  ok: boolean;
  reason?: string;
  telegramId?: string;
  tgUser?: Record<string, unknown> | null;
  hash?: string;
}

export function verifyTelegramInitData(initData: string): TelegramInitDataResult {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { ok: false, reason: "bot_token_not_configured" };

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { ok: false, reason: "no_hash" };

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

    if (!hashMatch) return { ok: false, reason: "hash_mismatch" };

    const authDate = Number(params.get("auth_date") ?? 0);
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - authDate > 86400) return { ok: false, reason: "expired" };

    const userStr = params.get("user");
    const tgUser = userStr ? JSON.parse(userStr) : null;
    const telegramId =
      tgUser && tgUser.id != null ? String(tgUser.id) : undefined;

    return { ok: true, telegramId, tgUser, hash };
  } catch {
    return { ok: false, reason: "parse_error" };
  }
}
