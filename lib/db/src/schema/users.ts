import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userLevelEnum = pgEnum("user_level", ["base", "pro", "expert"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username").notNull(),
  score: real("score").notNull().default(100),
  level: userLevelEnum("level").notNull().default("base"),
  points: integer("points").notNull().default(0),
  energy: integer("energy").notNull().default(100),
  maxEnergy: integer("max_energy").notNull().default(100),
  xp: integer("xp").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  walletAddress: text("wallet_address"),
  avatarUrl: text("avatar_url"),
  lastTaskAt: timestamp("last_task_at", { withTimezone: true }),
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
