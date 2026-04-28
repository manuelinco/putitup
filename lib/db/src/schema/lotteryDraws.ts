import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  real,
  json,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { datasetsTable } from "./datasets";

export const lotteryDrawsTable = pgTable("lottery_draws", {
  id: serial("id").primaryKey(),
  datasetId: integer("dataset_id").notNull().references(() => datasetsTable.id),
  prizePoolTon: real("prize_pool_ton").notNull(),
  winnersCount: integer("winners_count").notNull(),
  winners: json("winners").notNull().default([]),
  totalContributors: integer("total_contributors").notNull().default(0),
  drawnAt: timestamp("drawn_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLotteryDrawSchema = createInsertSchema(lotteryDrawsTable).omit({
  id: true,
  drawnAt: true,
});
export type InsertLotteryDraw = z.infer<typeof insertLotteryDrawSchema>;
export type LotteryDraw = typeof lotteryDrawsTable.$inferSelect;
