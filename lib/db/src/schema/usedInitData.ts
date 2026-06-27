import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Anti-replay store for Telegram initData (M-2). Persisted in the DB so replay
 * protection survives restarts and works across multiple API instances.
 */
export const usedInitDataTable = pgTable(
  "used_init_data",
  {
    hash: text("hash").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    expiresIdx: index("used_init_data_expires_idx").on(t.expiresAt),
  }),
);

export type UsedInitData = typeof usedInitDataTable.$inferSelect;
