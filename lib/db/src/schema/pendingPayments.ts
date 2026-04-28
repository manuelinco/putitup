import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  real,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const pendingPaymentsTable = pgTable("pending_payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  walletAddress: text("wallet_address").notNull(),
  amountTon: real("amount_ton").notNull(),
  reason: text("reason").notNull().default("task_rewards"),
  datasetId: integer("dataset_id"),
  isPaid: boolean("is_paid").notNull().default(false),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPendingPaymentSchema = createInsertSchema(pendingPaymentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPendingPayment = z.infer<typeof insertPendingPaymentSchema>;
export type PendingPayment = typeof pendingPaymentsTable.$inferSelect;
