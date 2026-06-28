import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const taskReportsTable = pgTable("task_reports", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  datasetId: integer("dataset_id"),
  reporterUserId: integer("reporter_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  reason: text("reason").notNull().default("wrong_question"),
  note: text("note"),
  questionSnapshot: text("question_snapshot"),
  status: text("status").notNull().default("pending"),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskReportSchema = createInsertSchema(taskReportsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTaskReport = z.infer<typeof insertTaskReportSchema>;
export type TaskReport = typeof taskReportsTable.$inferSelect;
