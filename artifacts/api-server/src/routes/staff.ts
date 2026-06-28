import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";
import { requireUserStrict } from "../middleware/requireUser";
import { signSessionToken, verifySessionToken } from "../lib/sessionToken";
import { hashPassword, verifyPassword, STAFF_PASSWORD_RE } from "../lib/staffAuth";

const router: IRouter = Router();

function safeUser(u: User) {
  const { passwordHash: _ph, ...rest } = u;
  return rest;
}

function getBearerToken(req: Request): string | null {
  const h = req.headers["authorization"];
  if (!h || Array.isArray(h)) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/staff/login — email + password for admins/supervisors.
router.post("/staff/login", async (req, res): Promise<void> => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (
    !user ||
    !user.passwordHash ||
    (!user.isAdmin && !user.isSupervisor) ||
    !verifyPassword(password, user.passwordHash)
  ) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // A pending (must-change) admin gets a RESTRICTED token usable ONLY on
  // /staff/change-password; full privileges require setting the password first.
  const token = signSessionToken(
    user.id,
    user.mustChangePassword ? "staff_pending" : "staff",
  );
  res.json({
    ok: true,
    token,
    user: safeUser(user),
    mustChangePassword: user.mustChangePassword,
  });
});

// POST /api/staff/change-password — accepts a normal "staff" token OR the
// restricted "staff_pending" token issued at first login. This is the ONLY
// route a pending token may use; every other guarded route rejects it, so the
// forced first-login password change cannot be skipped client- or server-side.
router.post("/staff/change-password", async (req, res): Promise<void> => {
  const token = getBearerToken(req);
  const claims = token ? verifySessionToken(token) : null;
  if (!claims || (claims.source !== "staff" && claims.source !== "staff_pending")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const userId = claims.userId;

  const newPassword = String(req.body?.newPassword ?? "");
  if (!STAFF_PASSWORD_RE.test(newPassword)) {
    res.status(400).json({
      error: "Password must be exactly 16 characters, letters and numbers only.",
    });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || (!user.isAdmin && !user.isSupervisor)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash: hashPassword(newPassword), mustChangePassword: false })
    .where(eq(usersTable.id, userId))
    .returning();

  // Now that the password is set, issue a full-privilege staff token.
  const freshToken = signSessionToken(userId, "staff");
  res.json({ ok: true, token: freshToken, user: safeUser(updated) });
});

// POST /api/staff/supervisors — admin-only, create a supervisor account.
router.post(
  "/staff/supervisors",
  requireUserStrict,
  async (req, res): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const [actor] = await db
      .select({ isAdmin: usersTable.isAdmin })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!actor?.isAdmin) {
      res.status(403).json({ error: "Only admins can create supervisors" });
      return;
    }

    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!EMAIL_RE.test(email)) {
      res.status(400).json({ error: "A valid email is required" });
      return;
    }
    if (username.length < 3) {
      res.status(400).json({ error: "Username must be at least 3 characters" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Initial password must be at least 6 characters" });
      return;
    }

    const [emailClash] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));
    if (emailClash) {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }
    const [nameClash] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, username));
    if (nameClash) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }

    const [created] = await db
      .insert(usersTable)
      .values({
        username,
        email,
        passwordHash: hashPassword(password),
        mustChangePassword: true,
        isSupervisor: true,
      })
      .returning();
    res.json({ ok: true, supervisor: safeUser(created) });
  },
);

export default router;
