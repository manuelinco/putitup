import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, chatMessagesTable, usersTable } from "@workspace/db";
import { requireUser } from "../middleware/requireUser";

const router: IRouter = Router();
const MAX_MSG_LEN = 500;
const RATE_LIMIT_MS = 2000;
const lastMessageTimes = new Map<number, number>();

router.get("/chat/messages", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
    const messages = await db
      .select()
      .from(chatMessagesTable)
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(limit);
    res.json({ messages: messages.reverse() });
  } catch {
    res.json({ messages: [] });
  }
});

router.post("/chat/messages", requireUser, async (req, res): Promise<void> => {
  try {
    const { userId, content } = req.body ?? {};
    if ((!userId && !req.userId) || !content) {
      res.status(400).json({ error: "userId and content are required" });
      return;
    }
    const uid = req.userId ?? Number(userId);
    if (!Number.isFinite(uid) || uid <= 0) {
      res.status(400).json({ error: "Invalid userId" });
      return;
    }
    const msg = String(content).trim().slice(0, MAX_MSG_LEN);
    if (msg.length < 1) {
      res.status(400).json({ error: "Message is empty" });
      return;
    }

    const now = Date.now();
    const lastTime = lastMessageTimes.get(uid) ?? 0;
    if (now - lastTime < RATE_LIMIT_MS) {
      res.status(429).json({ error: "Too fast — wait a moment" });
      return;
    }
    lastMessageTimes.set(uid, now);

    const [user] = await db.select({ username: usersTable.username })
      .from(usersTable).where(eq(usersTable.id, uid)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [saved] = await db.insert(chatMessagesTable).values({
      userId: uid,
      username: user.username,
      content: msg,
    }).returning();

    res.status(201).json({ message: saved });
  } catch {
    res.status(503).json({ error: "Chat unavailable" });
  }
});

export default router;
