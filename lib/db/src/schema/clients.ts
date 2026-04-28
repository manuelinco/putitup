import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  company: text("company"),
  walletAddress: text("wallet_address"),
  tokenBalance: integer("token_balance").notNull().default(0),
  adsWatchedToday: integer("ads_watched_today").notNull().default(0),
  totalAdsWatched: integer("total_ads_watched").notNull().default(0),
  riskScore: integer("risk_score").notNull().default(0),
  isBlocked: boolean("is_blocked").notNull().default(false),
  isEarlyAdopter: boolean("is_early_adopter").notNull().default(false),
  monthlyAdUnlocks: integer("monthly_ad_unlocks").notNull().default(0),
  monthlyAdUnlockResetAt: timestamp("monthly_ad_unlock_reset_at", { withTimezone: true }).notNull().defaultNow(),
  freeUnlocks: integer("free_unlocks").notNull().default(0),
  lastAdAt: timestamp("last_ad_at", { withTimezone: true }),
  lastAdResetAt: timestamp("last_ad_reset_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;