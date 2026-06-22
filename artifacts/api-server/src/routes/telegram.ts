import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"]?.split(/\s/)[0]?.trim();
const MINI_APP_URL = process.env["MINI_APP_URL"] ?? "https://tg.putitupbusiness.it/";

async function sendTelegramRequest(method: string, body: object) {
  if (!BOT_TOKEN) return null;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

router.post("/telegram/webhook", async (req, res): Promise<void> => {
  const update = req.body;
  res.sendStatus(200);

  try {
    const message = update?.message;
    const callbackQuery = update?.callback_query;

    if (message?.text === "/start" || message?.text?.startsWith("/start ")) {
      const chatId = message.chat.id;
      const firstName = message.from?.first_name ?? "there";
      const referralCode = message.text.split(" ")[1] ?? null;

      await sendTelegramRequest("sendMessage", {
        chat_id: chatId,
        text: `👋 Welcome to PUTITUP, ${firstName}!\n\n🤖 Label AI data. Earn real TON crypto.\n\n🔥 Each task you complete earns you 0.00004 TON\n🏆 Top contributors win lottery prizes\n👥 Invite friends and earn +500 pts per referral\n\nTap the button below to start earning 👇`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            {
              text: "🎮 TAP TO PLAY",
              web_app: { url: referralCode ? `${MINI_APP_URL}?ref=${referralCode}` : MINI_APP_URL },
            }
          ]]
        }
      });
    }

    if (callbackQuery) {
      await sendTelegramRequest("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
      });
    }
  } catch (err) {
    logger.error({ err }, "Telegram webhook error");
  }
});

router.post("/telegram/set-webhook", async (req, res): Promise<void> => {
  if (!BOT_TOKEN) {
    res.status(503).json({ error: "TELEGRAM_BOT_TOKEN not configured" });
    return;
  }
  const { webhookUrl } = req.body ?? {};
  if (!webhookUrl) {
    res.status(400).json({ error: "webhookUrl is required" });
    return;
  }

  const result = await sendTelegramRequest("setWebhook", {
    url: `${webhookUrl}/api/telegram/webhook`,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  res.json(result);
});

router.get("/telegram/webhook-info", async (_req, res): Promise<void> => {
  if (!BOT_TOKEN) {
    res.status(503).json({ error: "TELEGRAM_BOT_TOKEN not configured" });
    return;
  }
  const result = await sendTelegramRequest("getWebhookInfo", {});
  res.json(result);
});

router.post("/telegram/set-menu-button", async (req, res): Promise<void> => {
  if (!BOT_TOKEN) {
    res.status(503).json({ error: "TELEGRAM_BOT_TOKEN not configured" });
    return;
  }
  const { appUrl } = req.body ?? {};
  const url = appUrl ?? MINI_APP_URL;

  const result = await sendTelegramRequest("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "🎮 Play",
      web_app: { url },
    },
  });
  res.json(result);
});

export default router;
