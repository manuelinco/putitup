import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Lightweight auth guard for Telegram Mini App routes.
 * Expects X-User-Id header OR userId in query/body.
 * Attaches verified user id to req.userId.
 */
export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw =
    req.headers["x-user-id"] ??
    req.query?.userId ??
    req.body?.userId;

  const userId = Number(raw);
  if (!Number.isFinite(userId) || userId <= 0) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  (req as any).userId = userId;
  next();
}

/**
 * Guard that also ensures the authenticated user can only access their own data.
 * Route must have :id param matching the user's own id (or user must be admin).
 */
export async function requireSelf(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw =
    req.headers["x-user-id"] ??
    req.query?.userId ??
    req.body?.userId;

  const userId = Number(raw);
  const paramId = Number(req.params.id);

  if (!Number.isFinite(userId) || userId <= 0) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  if (!user.isAdmin && userId !== paramId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  (req as any).userId = userId;
  next();
}
