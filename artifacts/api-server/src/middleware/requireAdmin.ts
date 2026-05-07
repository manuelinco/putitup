import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const adminUsername = process.env["ADMIN_USERNAME"];
  const adminPassword = process.env["ADMIN_PASSWORD"];

  const authHeader = req.headers["authorization"] ?? "";
  const [scheme, encoded] = authHeader.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const [username, ...rest] = decoded.split(":");
    const password = rest.join(":");
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

  const adminId = Number(req.body?.adminId ?? req.query?.adminId);
  if (Number.isFinite(adminId)) {
    const [user] = await db.select({ isAdmin: usersTable.isAdmin })
      .from(usersTable)
      .where(eq(usersTable.id, adminId));
    if (user?.isAdmin) {
      next();
      return;
    }
  }

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
