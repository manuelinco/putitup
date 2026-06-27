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
