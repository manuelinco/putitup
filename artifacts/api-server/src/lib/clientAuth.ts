import { createHmac, timingSafeEqual } from "crypto";
import { eq, and, gt } from "drizzle-orm";
import type { Request } from "express";
import { db, clientsTable, clientSessionsTable } from "@workspace/db";

const SESSION_SECRET = (() => {
  const s = process.env["SESSION_SECRET"];
  if (!s) throw new Error("SESSION_SECRET env var is required");
  return s;
})();

export function verifyClientToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [idStr, rand, sig] = parts;
  const clientId = Number(idStr);
  if (!Number.isFinite(clientId)) return null;
  const expected = createHmac("sha256", SESSION_SECRET).update(`${clientId}:${rand}`).digest("hex");
  try {
    if (timingSafeEqual(Buffer.from(sig!, "hex"), Buffer.from(expected, "hex"))) return clientId;
  } catch {
    /* malformed signature */
  }
  return null;
}

export function getBearerToken(req: Request): string {
  const authHeader = req.headers["authorization"] ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

export interface AuthedClient {
  clientId: number;
  client: Record<string, any>;
}

/**
 * Authenticate a business client from the Bearer session token.
 * Verifies the HMAC signature AND that the session row exists & is unexpired.
 * Returns null for missing/invalid tokens, the admin token (id 0), or blocked clients.
 */
export async function authenticateClient(req: Request): Promise<AuthedClient | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const clientId = verifyClientToken(token);
  if (clientId === null || clientId === 0) return null;

  const now = new Date();
  const [session] = await db
    .select()
    .from(clientSessionsTable)
    .where(and(eq(clientSessionsTable.token, token), gt(clientSessionsTable.expiresAt, now)))
    .limit(1);
  if (!session) return null;

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client || (client as any).isBlocked) return null;

  return { clientId, client: client as any };
}
