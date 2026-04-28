import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { tasksTable } from "./tasks";

export const rewardLedgerTable = pgTable("reward_ledger", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  taskId: integer("task_id").references(() => tasksTable.id),
  datasetId: integer("dataset_id"),
  role: text("role").notNull(),
  rewardType: text("reward_type").notNull().default("task"),
  amountTon: real("amount_ton").notNull(),
  pointsValue: integer("points_value").notNull().default(0),
  status: text("status").notNull().default("approved"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRewardLedgerSchema = createInsertSchema(rewardLedgerTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRewardLedger = z.infer<typeof insertRewardLedgerSchema>;
export type RewardLedger = typeof rewardLedgerTable.$inferSelect;