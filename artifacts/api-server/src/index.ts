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
  // M-2 (CRITICAL, isolated): anti-replay store for Telegram initData. Run first
  // in its own connection/try so an unrelated legacy ALTER failure can never
  // silently skip creating the table that POST /auth/telegram/validate depends
  // on. Idempotent — this is the migration production (Neon) needs and we apply
  // it on every boot because we have no direct psql access to production.
  {
    const c = await pool.connect();
    try {
      await c.query(`
        CREATE TABLE IF NOT EXISTS used_init_data (
          hash       text PRIMARY KEY,
          expires_at timestamptz NOT NULL
        );
        CREATE INDEX IF NOT EXISTS used_init_data_expires_idx ON used_init_data (expires_at);
      `);
      logger.info("used_init_data migration OK");
    } catch (err) {
      logger.error({ err }, "used_init_data migration FAILED — Telegram initData replay store unavailable");
    } finally {
      c.release();
    }
  }

  // Wrong-question reports + moderator role. Isolated & idempotent — the Mini App
  // report basket and chat moderation depend on these. Applied on every boot
  // because we have no direct psql access to production (Neon).
  {
    const c = await pool.connect();
    try {
      await c.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS is_moderator boolean NOT NULL DEFAULT false;
        CREATE TABLE IF NOT EXISTS task_reports (
          id                  serial PRIMARY KEY,
          task_id             integer NOT NULL,
          dataset_id          integer,
          reporter_user_id    integer REFERENCES users(id) ON DELETE SET NULL,
          reason              text NOT NULL DEFAULT 'wrong_question',
          note                text,
          question_snapshot   text,
          status              text NOT NULL DEFAULT 'pending',
          reviewed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
          reviewed_at         timestamptz,
          created_at          timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS task_reports_status_idx ON task_reports (status);
      `);
      logger.info("task_reports + is_moderator migration OK");
    } catch (err) {
      logger.error({ err }, "task_reports/is_moderator migration FAILED — report basket & moderation unavailable");
    } finally {
      c.release();
    }
  }

  // Legacy idempotent schema (enum values + columns). Non-fatal.
  {
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
      logger.info("App migrations OK");
    } catch (err) {
      logger.warn({ err }, "App migrations warning (non-fatal)");
    } finally {
      client.release();
    }
  }

  // H-2: hard duplicate guard on task_responses. Best-effort & non-fatal: a live
  // DB that already contains duplicate (user_id, task_id) rows from the pre-fix
  // race will reject the unique index — that is fine, because the per-user row
  // lock + in-transaction duplicate check in POST /responses already prevent NEW
  // duplicates. Bounded with lock_timeout/statement_timeout (via SET LOCAL inside
  // a transaction, which auto-resets) so a non-concurrent CREATE INDEX on a large
  // hot table can never block or hang the deploy before app.listen.
  try {
    const uq = await pool.connect();
    try {
      await uq.query("BEGIN");
      await uq.query("SET LOCAL lock_timeout = '5s'");
      await uq.query("SET LOCAL statement_timeout = '30s'");
      await uq.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS task_responses_user_task_unique
          ON task_responses (user_id, task_id);
      `);
      await uq.query("COMMIT");
      logger.info("task_responses unique index OK");
    } catch (err) {
      try { await uq.query("ROLLBACK"); } catch { /* ignore */ }
      logger.warn(
        { err },
        "task_responses unique index skipped (existing duplicate rows or lock/statement timeout) — non-fatal; runtime guard in POST /responses still prevents new dupes",
      );
    } finally {
      uq.release();
    }
  } catch (err) {
    logger.warn({ err }, "task_responses unique index: could not acquire a DB connection (non-fatal)");
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
