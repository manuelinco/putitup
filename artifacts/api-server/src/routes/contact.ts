import { Router, type IRouter } from "express";
import { db, contactMessagesTable } from "@workspace/db";

const router: IRouter = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/contact", async (req, res): Promise<void> => {
  const { name, email, message, source } = req.body ?? {};
  if (!name || !email || !message) {
    res.status(400).json({ error: "name, email and message are required" });
    return;
  }
  if (!EMAIL_RE.test(String(email).trim())) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }
  const text = String(message).trim().slice(0, 2000);
  if (text.length < 10) {
    res.status(400).json({ error: "Message too short (min 10 chars)" });
    return;
  }
  await db.insert(contactMessagesTable).values({
    name: String(name).trim().slice(0, 200),
    email: String(email).trim().toLowerCase().slice(0, 200),
    message: text,
    source: String(source ?? "unknown").slice(0, 50),
  });
  res.status(201).json({ ok: true, message: "Message received! We'll get back to you soon." });
});

export default router;
