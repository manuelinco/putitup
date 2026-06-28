import { Router, type IRouter } from "express";
import { db, contactMessagesTable } from "@workspace/db";
import { sendContactNotificationEmail } from "../lib/email";

const router: IRouter = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/contact", async (req, res): Promise<void> => {
  try {
    const { name, email, message, source } = req.body ?? {};
    if (!name || !email || !message) {
      res.status(400).json({ error: "Nome, email e messaggio sono obbligatori" });
      return;
    }
    if (!EMAIL_RE.test(String(email).trim())) {
      res.status(400).json({ error: "Email non valida" });
      return;
    }
    const text = String(message).trim().slice(0, 2000);
    if (text.length < 10) {
      res.status(400).json({ error: "Messaggio troppo corto (minimo 10 caratteri)" });
      return;
    }
    const cleanName = String(name).trim().slice(0, 200);
    const cleanEmail = String(email).trim().toLowerCase().slice(0, 200);
    const cleanSource = String(source ?? "unknown").slice(0, 50);

    await db.insert(contactMessagesTable).values({
      name: cleanName,
      email: cleanEmail,
      message: text,
      source: cleanSource,
    });

    // Best-effort email notification to the PUTITUP inbox. Never let a mail
    // failure break the contact submission — the message is already stored.
    void sendContactNotificationEmail({
      name: cleanName,
      email: cleanEmail,
      message: text,
      source: cleanSource,
    })
      .then((sent) => {
        if (!sent) req.log.warn("Contact notification email not sent");
      })
      .catch((err) => req.log.error({ err }, "Contact notification email failed"));

    res.status(201).json({ ok: true, message: "Messaggio ricevuto! Ti risponderemo al più presto." });
  } catch {
    res.status(503).json({ error: "Servizio contatti non disponibile" });
  }
});

export default router;
