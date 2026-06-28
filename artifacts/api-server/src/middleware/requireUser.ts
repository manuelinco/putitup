import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifySessionToken } from "../lib/sessionToken";

/**
 * Auth guards for Telegram Mini App routes.
 *
 * Identity is derived from a signed session token (Authorization: Bearer ...).
 * A client-provided userId (header/query/body/param) is NEVER trusted on its
 * own when a token is present; if it disagrees with the token it is rejected.
 *
 * AUTH_ENFORCE controls the legacy fallback during the staged rollout:
 *   - "soft"  (default): when no token is present the guard is additive — it
 *                        lets legacy/cached clients through (they still pass
 *                        their userId in the body/path as before). Tokened
 *                        clients are fully protected against cross-user access.
 *   - "strict"         : a valid session token is required on every guarded
 *                        route; no legacy fallback.
 *
 * The guards never 404/loads the user themselves — downstream handlers keep
 * their own existence checks. They only resolve and attach `req.userId`.
 */
const STRICT = (process.env.AUTH_ENFORCE ?? "soft").toLowerCase() === "strict";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

function getBearer(req: Request): string | null {
  const h = req.headers["authorization"];
  if (!h || Array.isArray(h)) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

function toUserId(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/**
 * Collect every client-supplied userId hint from a request. `paramName` lets
 * path-param routes (e.g. /referral/stats/:userId) participate.
 */
function suppliedIds(req: Request, paramName?: string): number[] {
  const out: number[] = [];
  const push = (v: unknown) => {
    const n = toUserId(v);
    if (!Number.isNaN(n)) out.push(n);
  };
  push(req.headers["x-user-id"]);
  push((req.query as Record<string, unknown> | undefined)?.userId);
  push((req.body as Record<string, unknown> | undefined)?.userId);
  if (paramName) push(req.params?.[paramName]);
  return out;
}

function makeRequireUser(paramName?: string, forceStrict = false) {
  return function requireUserMw(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const token = getBearer(req);

    if (token) {
      const claims = verifySessionToken(token);
      if (!claims) {
        res.status(401).json({ error: "Invalid or expired session" });
        return;
      }
      if (claims.source === "staff_pending") {
        res.status(403).json({ error: "Password change required" });
        return;
      }
      const supplied = suppliedIds(req, paramName);
      if (supplied.some((id) => id !== claims.userId)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      req.userId = claims.userId;
      next();
      return;
    }

    if (STRICT || forceStrict) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Soft mode, no token: additive — trust the legacy supplied id (if any).
    const supplied = suppliedIds(req, paramName);
    if (supplied.length > 0) req.userId = supplied[0];
    next();
  };
}

/** Guard for routes that carry userId in the body / query / X-User-Id header. */
export const requireUser = makeRequireUser();

/**
 * Strict guard for reward-bearing routes (ad challenge / watch / tracking): a
 * valid session token is ALWAYS required, regardless of the global AUTH_ENFORCE
 * soft rollout. Closes the soft-mode hole where a body `userId` alone could mint
 * an ad-challenge token or claim a reward without proving identity.
 */
export const requireUserStrict = makeRequireUser(undefined, true);

/** Guard factory for routes that carry userId in a path param. */
export function requireUserParam(paramName: string) {
  return makeRequireUser(paramName);
}

/**
 * Guard for `/users/:id`-style self routes: the caller may only act on their
 * own id (admins may act on anyone).
 */
export async function requireSelf(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = getBearer(req);
  const paramId = toUserId(req.params.id);

  if (token) {
    const claims = verifySessionToken(token);
    if (!claims) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }
    if (claims.source === "staff_pending") {
      res.status(403).json({ error: "Password change required" });
      return;
    }
    if (!Number.isNaN(paramId) && claims.userId !== paramId) {
      const [actor] = await db
        .select({ isAdmin: usersTable.isAdmin })
        .from(usersTable)
        .where(eq(usersTable.id, claims.userId));
      if (!actor?.isAdmin) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    req.userId = claims.userId;
    next();
    return;
  }

  if (STRICT) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Soft mode, no token: legacy behaviour trusted the path id.
  if (!Number.isNaN(paramId)) req.userId = paramId;
  next();
}
