import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, chatMessagesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();
const MAX_MSG_LEN = 500;
const RATE_LIMIT_MS = 2000;
const lastMessageTimes = new Map<number, number>();

router.get("/chat/messages", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
  const messages = await db
    .select()
    .from(chatMessagesTable)
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(limit);
  res.json({ messages: messages.reverse() });
});

router.post("/chat/messages", async (req, res): Promise<void> => {
  const { userId, content } = req.body ?? {};
  if (!userId || !content) {
    res.status(400).json({ error: "userId and content are required" });
    return;
  }
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }
  const text = String(content).trim().slice(0, MAX_MSG_LEN);
  if (!text) {
    res.status(400).json({ error: "Message cannot be empty" });
    return;
  }

  const now = Date.now();
  const last = lastMessageTimes.get(uid) ?? 0;
  if (now - last < RATE_LIMIT_MS) {
    res.status(429).json({ error: "Slow down — wait a moment before sending again" });
    return;
  }
  lastMessageTimes.set(uid, now);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [msg] = await db
    .insert(chatMessagesTable)
    .values({ userId: uid, username: user.username, content: text })
    .returning();

  res.status(201).json({ message: msg });
});

export default router;
