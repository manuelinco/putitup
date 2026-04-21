import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { datasetsTable } from "./datasets";

export const datasetAccessTable = pgTable("dataset_access", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  datasetId: integer("dataset_id").notNull().references(() => datasetsTable.id),
  method: text("method").notNull(),
  tokensSpent: integer("tokens_spent").notNull().default(0),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  status: text("status").notNull().default("granted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDatasetAccessSchema = createInsertSchema(datasetAccessTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDatasetAccess = z.infer<typeof insertDatasetAccessSchema>;
export type DatasetAccess = typeof datasetAccessTable.$inferSelect;