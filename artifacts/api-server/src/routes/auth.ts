import { Router, type IRouter } from "express";
import crypto from "crypto";

const router: IRouter = Router();

/**
 * POST /api/auth/telegram/validate
 * Validates Telegram WebApp initData via HMAC-SHA256.
 * Body: { initData: string }
 * Returns: { valid: boolean, user?: TelegramUser }
 *
 * Requires TELEGRAM_BOT_TOKEN env variable. If not set, responds with
 * { valid: false, reason: "bot_token_not_configured" } so the app can
 * degrade gracefully in development.
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

    const expectedHash = crypto
      .createHmac("sha256", secretKey)
      .update(checkString)
      .digest("hex");

    if (expectedHash !== hash) {
      res.json({ valid: false, reason: "hash_mismatch" });
      return;
    }

    const authDate = Number(params.get("auth_date") ?? 0);
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - authDate > 86400) {
      res.json({ valid: false, reason: "expired" });
      return;
    }

    const userStr = params.get("user");
    const user = userStr ? JSON.parse(userStr) : null;
    res.json({ valid: true, user });
  } catch {
    res.status(400).json({ valid: false, reason: "parse_error" });
  }
});

export default router;
