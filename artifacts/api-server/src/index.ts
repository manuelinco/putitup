import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./lib/stripeClient";
import { startAgentCron } from "./lib/taskAgent";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

// ── Startup DB migrations (local schema changes) ────────────────────────────
async function runAppMigrations() {
  const client = await pool.connect();
  try {
    // Add new enum values for audio/video task types (IF NOT EXISTS via DO block)
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'audio' AND enumtypid = 'task_type'::regtype) THEN
          ALTER TYPE task_type ADD VALUE 'audio';
        END IF;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'video' AND enumtypid = 'task_type'::regtype) THEN
          ALTER TYPE task_type ADD VALUE 'video';
        END IF;
      END $$;
    `);
    await client.query(`
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS needs_relabeling boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS relabel_options   jsonb;
      ALTER TABLE clients
        ADD COLUMN IF NOT EXISTS stripe_customer_id      text,
        ADD COLUMN IF NOT EXISTS stripe_subscription_id  text,
        ADD COLUMN IF NOT EXISTS plan                    text NOT NULL DEFAULT 'free';
    `);

    // M-2: anti-replay store for Telegram initData. Safe & idempotent — this is
    // the migration the production (Neon) DB needs before the token-auth backend
    // can serve POST /auth/telegram/validate, so it is applied here on every boot
    // rather than requiring manual psql access to production.
    await client.query(`
      CREATE TABLE IF NOT EXISTS used_init_data (
        hash       text PRIMARY KEY,
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS used_init_data_expires_idx ON used_init_data (expires_at);
    `);

    logger.info("App migrations OK");
  } catch (err) {
    logger.warn({ err }, "App migrations warning (non-fatal)");
  } finally {
    client.release();
  }

  // H-2: hard duplicate guard on task_responses, applied in its own isolated
  // transaction. Best-effort & non-fatal: a live DB that already contains
  // duplicate (user_id, task_id) rows from the pre-fix race will reject the
  // unique index — that is fine, because the per-user row lock + in-transaction
  // duplicate check in POST /responses already prevent NEW duplicates. The hard
  // constraint just adds defence-in-depth once any legacy duplicates are removed.
  const uqClient = await pool.connect();
  try {
    await uqClient.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS task_responses_user_task_unique
        ON task_responses (user_id, task_id);
    `);
    logger.info("task_responses unique index OK");
  } catch (err) {
    logger.warn(
      { err },
      "task_responses unique index skipped (likely existing duplicate rows) — manual dedupe needed to enable the hard constraint",
    );
  } finally {
    uqClient.release();
  }
}

// ── Stripe schema + webhook setup ───────────────────────────────────────────
async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping Stripe init");
    return;
  }
  try {
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();

    const webhookBase = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : process.env.PUBLIC_URL ?? "";

    if (webhookBase) {
      await stripeSync.findOrCreateManagedWebhook(`${webhookBase}/api/stripe/webhook`);
      logger.info("Stripe webhook configured");
    }

    // Non-blocking backfill
    stripeSync.syncBackfill()
      .then(() => logger.info("Stripe backfill complete"))
      .catch((err) => logger.warn({ err }, "Stripe backfill warning"));
  } catch (err) {
    // Stripe init failure must not crash the server (integration may not be connected in dev)
    logger.warn({ err }, "Stripe init failed (non-fatal) — payments will be unavailable");
  }
}

async function main() {
  await runAppMigrations();
  await initStripe();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });

  // ── Task Agent cron: ogni ora genera nuove task da fonti web ──────────────
  const agentIntervalMin = parseInt(process.env["AGENT_INTERVAL_MIN"] ?? "60", 10);
  startAgentCron(agentIntervalMin * 60 * 1000);
}

main();
