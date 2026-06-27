import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  real,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userLevelEnum = pgEnum("user_level", ["base", "pro", "expert"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").unique(),
  walletAddress: text("wallet_address").unique(),
  username: text("username").notNull().unique(),
  score: real("score").notNull().default(100),
  level: userLevelEnum("level").notNull().default("base"),
  points: integer("points").notNull().default(0),
  energy: integer("energy").notNull().default(100),
  maxEnergy: integer("max_energy").notNull().default(100),
  xp: integer("xp").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  avatarUrl: text("avatar_url"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isSupervisor: boolean("is_supervisor").notNull().default(false),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  address: text("address"),
  company: text("company"),
  lastTaskAt: timestamp("last_task_at", { withTimezone: true }),
  referralCode: text("referral_code").unique(),
  referredBy: integer("referred_by"),
  referralCount: integer("referral_count").notNull().default(0),
  referralBonusEarned: integer("referral_bonus_earned").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
