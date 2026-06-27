import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifySessionToken } from "../lib/sessionToken";

const SESSION_SECRET = process.env["SESSION_SECRET"] ?? "";

/**
 * Verify a business/admin session token (format `id.rand.sig`, HMAC-SHA256 with
 * SESSION_SECRET) issued by POST /auth/admin/login. Returns the embedded id
 * (0 = business admin) or null. Mirrors the issuer in routes/otp.ts.
 */
function verifyAdminSessionToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !SESSION_SECRET) return null;
  const [idStr, rand, sig] = parts;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(`${id}:${rand}`).digest("hex");
  try {
    if (crypto.timingSafeEqual(Buffer.from(sig!, "hex"), Buffer.from(expected, "hex"))) return id;
  } catch {}
  return null;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const adminUsername = process.env["ADMIN_USERNAME"];
  const adminPassword = process.env["ADMIN_PASSWORD"];

  const authHeader = req.headers["authorization"] ?? "";
  const [scheme, encoded] = authHeader.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const [username, ...rest] = decoded.split(":");
    const password = rest.join(":");

    // (a) Admin session token from /auth/admin/login, sent by the business admin
    //     panel as Basic base64(`${token}:`) (token as username, empty password).
    if (username && password === "" && verifyAdminSessionToken(username) === 0) {
      next();
      return;
    }

    // (b) Raw ADMIN_USERNAME:ADMIN_PASSWORD basic auth.
    let usernameMatch = false;
    let passwordMatch = false;
    try {
      const uBuf = Buffer.from(username);
      const uRef = Buffer.from(adminUsername ?? "");
      const pBuf = Buffer.from(password);
      const pRef = Buffer.from(adminPassword ?? "");
      if (uBuf.length === uRef.length && pBuf.length === pRef.length) {
        usernameMatch = crypto.timingSafeEqual(uBuf, uRef);
        passwordMatch = crypto.timingSafeEqual(pBuf, pRef);
      }
    } catch {}
    if (usernameMatch && passwordMatch) {
      next();
      return;
    }
  }

  if (scheme === "Bearer" && encoded) {
    // (c) Business admin token (id = 0) from /auth/admin/login.
    if (verifyAdminSessionToken(encoded) === 0) {
      next();
      return;
    }
    // (c2) Mini App user session token whose user is flagged admin in the DB.
    const claims = verifySessionToken(encoded);
    if (claims) {
      const [user] = await db
        .select({ isAdmin: usersTable.isAdmin })
        .from(usersTable)
        .where(eq(usersTable.id, claims.userId));
      if (user?.isAdmin) {
        next();
        return;
      }
    }
  }

  // NOTE: the legacy `adminId` body/query fallback was removed — trusting a
  // caller-supplied id allowed privilege escalation (e.g. `?adminId=<known id>`)
  // without any credential. Admin access now requires Basic auth, an admin
  // session token, or a Mini App Bearer token whose DB user is flagged admin.
  res.status(403).json({ error: "Forbidden: admin authentication required" });
}

export async function requireSupervisorOrAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = Number(req.body?.supervisorId ?? req.body?.userId ?? req.query?.userId);
  if (!Number.isFinite(userId)) {
    res.status(403).json({ error: "Forbidden: supervisor authentication required" });
    return;
  }
  const [user] = await db.select({ isAdmin: usersTable.isAdmin, isSupervisor: usersTable.isSupervisor })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (user?.isAdmin || user?.isSupervisor) {
    next();
    return;
  }
  res.status(403).json({ error: "Forbidden: supervisor or admin required" });
}
