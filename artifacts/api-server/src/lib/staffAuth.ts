import { randomBytes, pbkdf2Sync, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "./logger";

// ── Password hashing (pbkdf2, mirrors clients.ts) ───────────────────────────
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const verify = pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(verify, "hex"));
  } catch {
    return false;
  }
}

/** New staff passwords must be EXACTLY 16 alphanumeric characters. */
export const STAFF_PASSWORD_RE = /^[A-Za-z0-9]{16}$/;

const ADMIN_EMAIL = "piscitellimanuel5@gmail.com";

/**
 * Resolve the one-time initial admin password. Prefer STAFF_ADMIN_INITIAL_PASSWORD
 * from the environment; if it is absent, generate a strong random password so
 * production never ships a known/guessable default. Either way the admin is
 * forced to replace it on first login.
 */
function resolveInitialPassword(): { password: string; generated: boolean } {
  const fromEnv = process.env["STAFF_ADMIN_INITIAL_PASSWORD"];
  if (fromEnv && fromEnv.length >= 8) return { password: fromEnv, generated: false };
  const password = randomBytes(24)
    .toString("base64")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 16)
    .padEnd(16, "0");
  return { password, generated: true };
}

function logGeneratedPassword(password: string): void {
  logger.warn(
    { initialAdminPassword: password },
    "STAFF_ADMIN_INITIAL_PASSWORD not set — generated a one-time admin password. " +
      "Log in as the admin and change it immediately. Set STAFF_ADMIN_INITIAL_PASSWORD to control this value.",
  );
}

/**
 * Idempotently ensure the platform admin account exists with email+password
 * login enabled. Runs on every boot (no direct psql access to production).
 * Never resets an existing password — only fills in what is missing.
 */
export async function ensureStaffAdmin(): Promise<void> {
  try {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, ADMIN_EMAIL));

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (!existing.isAdmin) patch["isAdmin"] = true;
      if (!existing.passwordHash) {
        const { password, generated } = resolveInitialPassword();
        patch["passwordHash"] = hashPassword(password);
        patch["mustChangePassword"] = true;
        if (generated) logGeneratedPassword(password);
      }
      if (Object.keys(patch).length > 0) {
        await db.update(usersTable).set(patch).where(eq(usersTable.id, existing.id));
        logger.info("staff admin account reconciled");
      }
      return;
    }

    // Create the admin. username is unique — fall back if "admin" is taken.
    let username = "admin";
    const [clash] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, username));
    if (clash) username = "putitup_admin";

    const { password, generated } = resolveInitialPassword();
    await db.insert(usersTable).values({
      username,
      email: ADMIN_EMAIL,
      passwordHash: hashPassword(password),
      mustChangePassword: true,
      isAdmin: true,
    });
    if (generated) logGeneratedPassword(password);
    logger.info("staff admin account seeded");
  } catch (err) {
    logger.error({ err }, "ensureStaffAdmin failed (non-fatal)");
  }
}
