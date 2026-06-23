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

Etichetta dati AI e guadagna vero crypto TON per ogni task completato.

🎮 *Gioca e Guadagna* — Completa task di labeling e accumula TON
💰 *Il mio Saldo* — Controlla i tuoi TON e richiedi il pagamento  
🏆 *Classifica* — Scala la leaderboard e vinci premi settimanali
👥 *Referral* — Invita amici e guadagna +500 punti bonus

Ogni task vale *0.00004 TON* · Pagamento diretto al tuo wallet`;

router.post("/telegram/webhook", async (req, res): Promise<void> => {
  const update = req.body;
  res.sendStatus(200);

  try {
    const message = update?.message;
    const callbackQuery = update?.callback_query;

    if (message?.text === "/start" || message?.text?.startsWith("/start ")) {
      const chatId = message.chat.id;
      const firstName = message.from?.first_name ?? "amico";
      const referralCode = message.text.split(" ")[1] ?? null;

      const playUrl = referralCode ? `${appUrl("/")}?ref=${referralCode}` : appUrl("/");

      await sendTelegramRequest("sendMessage", {
        chat_id: chatId,
        text: `👋 Ciao ${firstName}! Benvenuto su *PUTITUP*\n\n🤖 Etichetta dati AI e guadagna vero crypto TON.\n\n🔥 Ogni task completato vale *0.00004 TON*\n🏆 I migliori salgono in classifica e vincono premi\n👥 Invita amici e ottieni *+500 punti* per ogni referral\n\n👇 Scegli cosa vuoi fare:`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🎮 Gioca e Guadagna", web_app: { url: playUrl } },
            ],
            [
              { text: "💰 Il mio Saldo", web_app: { url: appUrl("/profile/me") } },
              { text: "🏆 Classifica", web_app: { url: appUrl("/leaderboard") } },
            ],
            [
              { text: "ℹ️ Come funziona", callback_data: "info" },
            ],
          ]
        }
      });
      return;
    }

    if (message?.text === "/saldo") {
      const chatId = message.chat.id;
      await sendTelegramRequest("sendMessage", {
        chat_id: chatId,
        text: `💰 *Il tuo saldo PUTITUP*\n\nApri la mini app per vedere i tuoi TON accumulati, richiedere il pagamento e controllare lo storico ricompense.`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "💰 Apri Saldo", web_app: { url: appUrl("/profile/me") } },
          ]]
        }
      });
      return;
    }

    if (message?.text === "/classifica") {
      const chatId = message.chat.id;
      await sendTelegramRequest("sendMessage", {
        chat_id: chatId,
        text: `🏆 *Classifica PUTITUP*\n\nVedi chi sono i migliori contributor della settimana. Scala la classifica per vincere premi extra!`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "🏆 Apri Classifica", web_app: { url: appUrl("/leaderboard") } },
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
            { text: "🎮 Inizia a guadagnare", web_app: { url: appUrl("/") } },
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
              { text: "🎮 Inizia a guadagnare", web_app: { url: appUrl("/") } },
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
      { command: "start", description: "🚀 Avvia PUTITUP" },
      { command: "saldo", description: "💰 Vedi il tuo saldo TON" },
      { command: "classifica", description: "🏆 Apri la classifica" },
      { command: "info", description: "ℹ️ Come funziona PUTITUP" },
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
      text: "🎮 Gioca",
      web_app: { url },
    },
  });
  res.json(result);
});

export default router;
