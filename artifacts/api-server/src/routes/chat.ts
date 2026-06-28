import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, chatMessagesTable, usersTable } from "@workspace/db";
import { requireUser } from "../middleware/requireUser";

const router: IRouter = Router();
const MAX_MSG_LEN = 500;
const RATE_LIMIT_MS = 2000;
const lastMessageTimes = new Map<number, number>();

// ── Italian profanity / blasphemy filter ─────────────────────────────────────
// Normalizes the message (lowercase, strips accents, collapses repeated chars and
// non-letter separators) so that obfuscated variants ("c.a.z.z.o", "caaazzo",
// "dìo càne") are still caught. Matches against both a spaced and a compact form.

function normalizeForFilter(input: string): { spaced: string; compact: string } {
  const base = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, " ") // non-alphanumeric → space
    .replace(/(.)\1{2,}/g, "$1$1") // collapse 3+ repeated chars → 2
    .trim();
  return { spaced: base, compact: base.replace(/\s+/g, "") };
}

// Each pattern is tested against both the spaced and the compact forms.
const PROFANITY_PATTERNS: RegExp[] = [
  // Parolacce
  /\bcazz(o|i|ata|ate|uto)\b/,
  /\bstronz(o|a|i|e|ata)\b/,
  /\bmerd(a|e|oso|osa)\b/,
  /\bvaffanculo\b/,
  /\bfanculo\b/,
  /\bvaffancul\b/,
  /\bculo\b/,
  /\bfig(a|he|ata)\b/,
  /\btroi(a|e)\b/,
  /\bputtan(a|e|ata|iere)\b/,
  /\bzoccol(a|e)\b/,
  /\bcoglion(e|i|ata)\b/,
  /\bbastard(o|a|i|e)\b/,
  /\bminchi(a|e|ata|one)\b/,
  /\bmignott(a|e)\b/,
  /\bsborr(a|are|ata)\b/,
  /\bpompin(o|i|ara)\b/,
  /\bculatton(e|i)\b/,
  /\bfrocio\b/,
  /\bfroci\b/,
  /\bricchione\b/,
  /\bcesso\b/,
  /\bpirla\b/,
  /\bteste di cazzo\b/,
  /\btestadicazzo\b/,
  // Bestemmie (blasphemy) — dio / madonna / cristo / gesù + offensive qualifier
  /\bdio\s?(can(e|i)?|porc(o|i)|boia|merd(a|oso)?|maial(e|i)?|bastard(o|i)?|ladr(o|i)|stronz(o|i)|cret(i|in)|schifoso|infame|impestato|cane)\b/,
  /\bporc(o|a)\s?(dio|madonna|madonn|signore|gesu|cristo|eva|giuda)\b/,
  /\bmadonn(a)?\s?(puttan(a)?|troi(a)?|maial(a)?|ladr(a)?|porc(a)?|sgualdrina|cagna)\b/,
  /\bcrist(o)?\s?(dio|merda|porc(o)?|schifoso|bastardo)\b/,
  /\bgesu\s?(crist(o)?\s?)?(merd(a)?|porc(o)?|bastard(o)?|cane)\b/,
  // Compact bestemmie (no spaces)
  /diocan(e|i)/,
  /diaul/,
  /diaol/,
  /dioporc/,
  /dioboia/,
  /diomerd/,
  /diomaial/,
  /dioladr/,
  /diostronz/,
  /porcodio/,
  /porcamadonn/,
  /porcamadonna/,
  /madonnaputtan/,
  /madonnatroia/,
  /madonnamaiala/,
  /cristomerda/,
  /gesucristomerda/,
];

function containsProfanity(input: string): boolean {
  const { spaced, compact } = normalizeForFilter(input);
  if (!spaced) return false;
  for (const re of PROFANITY_PATTERNS) {
    if (re.test(spaced) || re.test(compact)) return true;
  }
  return false;
}

router.get("/chat/messages", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
    const messages = await db
      .select()
      .from(chatMessagesTable)
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(limit);
    res.json({ messages: messages.reverse() });
  } catch (err) {
    req.log?.error({ err }, "chat: failed to load messages");
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

    // ── Profanity / blasphemy filter ──────────────────────────────────────────
    if (containsProfanity(msg)) {
      res.status(422).json({ error: "Messaggio bloccato: linguaggio non consentito" });
      return;
    }

    const now = Date.now();
    const lastTime = lastMessageTimes.get(uid) ?? 0;
    if (now - lastTime < RATE_LIMIT_MS) {
      res.status(429).json({ error: "Troppo veloce — aspetta un momento" });
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
  } catch (err) {
    req.log?.error({ err }, "chat: failed to post message");
    res.status(503).json({ error: "Chat unavailable" });
  }
});

// ── Moderation: delete a message ──────────────────────────────────────────────
// Allowed for the message owner, admins (users.isAdmin) and appointed moderators
// (users.isModerator). Hard delete.
router.delete("/chat/messages/:id", requireUser, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "Invalid message id" });
      return;
    }
    const uid = req.userId ?? Number((req.body as Record<string, unknown> | undefined)?.userId ?? req.query["userId"]);
    if (!Number.isFinite(uid) || uid <= 0) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const [msg] = await db.select().from(chatMessagesTable)
      .where(eq(chatMessagesTable.id, id)).limit(1);
    if (!msg) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    const [actor] = await db
      .select({ isAdmin: usersTable.isAdmin, isModerator: usersTable.isModerator })
      .from(usersTable).where(eq(usersTable.id, uid)).limit(1);

    const canDelete = msg.userId === uid || !!actor?.isAdmin || !!actor?.isModerator;
    if (!canDelete) {
      res.status(403).json({ error: "Non autorizzato" });
      return;
    }

    await db.delete(chatMessagesTable).where(eq(chatMessagesTable.id, id));
    res.json({ ok: true, id });
  } catch (err) {
    req.log?.error({ err }, "chat: failed to delete message");
    res.status(503).json({ error: "Chat unavailable" });
  }
});

export default router;
