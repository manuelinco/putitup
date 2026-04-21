import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { tasksTable } from "./tasks";

export const taskResponsesTable = pgTable("task_responses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasksTable.id),
  answer: text("answer").notNull(),
  isCorrect: boolean("is_correct"),
  responseTimeMs: integer("response_time_ms").notNull().default(0),
  pointsEarned: integer("points_earned").notNull().default(0),
  rewardTon: real("reward_ton").notNull().default(0),
  rewardStatus: text("reward_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertTaskResponseSchema = createInsertSchema(
  taskResponsesTable,
).omit({ id: true, createdAt: true });
export type InsertTaskResponse = z.infer<typeof insertTaskResponseSchema>;
export type TaskResponse = typeof taskResponsesTable.$inferSelect;
