import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run lightweight startup migrations to ensure columns exist on the remote DB.
// Uses ADD COLUMN IF NOT EXISTS so it's a no-op on subsequent deploys.
async function runStartupMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS needs_relabeling boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS relabel_options   jsonb;
    `);
    logger.info("Startup migrations OK");
  } catch (err) {
    logger.warn({ err }, "Startup migrations warning (non-fatal)");
  } finally {
    client.release();
  }
}

runStartupMigrations().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
});
