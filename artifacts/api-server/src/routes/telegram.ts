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

function appUrl(path: string) {
  const base = MINI_APP_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

const INFO_TEXT = `⚡ *PUTITUP* — AI Data Platform

Label AI data and earn real TON crypto for every task you complete.

🎮 *Play & Earn* — Complete labeling tasks and stack up TON
💰 *My Balance* — Check your TON and request a payout
🏆 *Leaderboard* — Climb the rankings and win weekly prizes
👥 *Referral* — Invite friends and earn +500 bonus points

Every task is worth *0.00004 TON* · Paid directly to your wallet`;

router.post("/telegram/webhook", async (req, res): Promise<void> => {
  const update = req.body;
  res.sendStatus(200);

  try {
    const message = update?.message;
    const callbackQuery = update?.callback_query;

    if (message?.text === "/start" || message?.text?.startsWith("/start ")) {
      const chatId = message.chat.id;
      const firstName = message.from?.first_name ?? "friend";
      const referralCode = message.text.split(" ")[1] ?? null;

      const playUrl = referralCode ? `${appUrl("/")}?ref=${referralCode}` : appUrl("/");

      await sendTelegramRequest("sendMessage", {
        chat_id: chatId,
        text: `👋 Hi ${firstName}! Welcome to *PUTITUP*\n\n🤖 Label AI data and earn real TON crypto.\n\n🔥 Every completed task is worth *0.00004 TON*\n🏆 Top contributors climb the leaderboard and win prizes\n👥 Invite friends and get *+500 points* per referral\n\n👇 Choose what you want to do:`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🎮 Play & Earn", web_app: { url: playUrl } },
            ],
            [
              { text: "💰 My Balance", web_app: { url: appUrl("/profile/me") } },
              { text: "🏆 Leaderboard", web_app: { url: appUrl("/leaderboard") } },
            ],
            [
              { text: "ℹ️ How it works", callback_data: "info" },
            ],
          ]
        }
      });
      return;
    }

    // /balance (new) — /saldo kept for backward compatibility during rollout
    if (message?.text === "/balance" || message?.text === "/saldo") {
      const chatId = message.chat.id;
      await sendTelegramRequest("sendMessage", {
        chat_id: chatId,
        text: `💰 *Your PUTITUP balance*\n\nOpen the mini app to see your accumulated TON, request a payout and check your reward history.`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "💰 Open Balance", web_app: { url: appUrl("/profile/me") } },
          ]]
        }
      });
      return;
    }

    // /leaderboard (new) — /classifica kept for backward compatibility during rollout
    if (message?.text === "/leaderboard" || message?.text === "/classifica") {
      const chatId = message.chat.id;
      await sendTelegramRequest("sendMessage", {
        chat_id: chatId,
        text: `🏆 *PUTITUP Leaderboard*\n\nSee who the top contributors of the week are. Climb the leaderboard to win extra prizes!`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "🏆 Open Leaderboard", web_app: { url: appUrl("/leaderboard") } },
          ]]
        }
      });
      return;
    }

    if (message?.text === "/info" || message?.text === "/help") {
      const chatId = message.chat.id;
      await sendTelegramRequest("sendMessage", {
        chat_id: chatId,
        text: INFO_TEXT,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "🎮 Start earning", web_app: { url: appUrl("/") } },
          ]]
        }
      });
      return;
    }

    if (callbackQuery) {
      const chatId = callbackQuery.message?.chat?.id;
      await sendTelegramRequest("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
      });

      if (callbackQuery.data === "info" && chatId) {
        await sendTelegramRequest("sendMessage", {
          chat_id: chatId,
          text: INFO_TEXT,
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "🎮 Start earning", web_app: { url: appUrl("/") } },
            ]]
          }
        });
      }
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

router.post("/telegram/set-commands", async (_req, res): Promise<void> => {
  if (!BOT_TOKEN) {
    res.status(503).json({ error: "TELEGRAM_BOT_TOKEN not configured" });
    return;
  }
  const result = await sendTelegramRequest("setMyCommands", {
    commands: [
      { command: "start", description: "🚀 Start PUTITUP" },
      { command: "balance", description: "💰 Check your TON balance" },
      { command: "leaderboard", description: "🏆 Open the leaderboard" },
      { command: "info", description: "ℹ️ How PUTITUP works" },
    ]
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
  const { appUrl: customUrl } = req.body ?? {};
  const url = customUrl ?? MINI_APP_URL;

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
