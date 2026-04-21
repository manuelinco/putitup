import {
  pgTable,
  serial,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const adsTrackingTable = pgTable("ads_tracking", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id),
  adsWatchedToday: integer("ads_watched_today").notNull().default(0),
  totalAdsWatched: integer("total_ads_watched").notNull().default(0),
  datasetTokens: integer("dataset_tokens").notNull().default(0),
  riskScore: integer("risk_score").notNull().default(0),
  suspiciousCount: integer("suspicious_count").notNull().default(0),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  lastViewTime: timestamp("last_view_time", { withTimezone: true }),
  lastResetDate: timestamp("last_reset_date", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAdsTrackingSchema = createInsertSchema(
  adsTrackingTable,
).omit({ id: true, createdAt: true });
export type InsertAdsTracking = z.infer<typeof insertAdsTrackingSchema>;
export type AdsTracking = typeof adsTrackingTable.$inferSelect;
