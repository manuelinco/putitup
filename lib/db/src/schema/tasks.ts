import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  json,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const taskTypeEnum = pgEnum("task_type", [
  "image",
  "text",
  "classification",
]);
export const taskDifficultyEnum = pgEnum("task_difficulty", [
  "easy",
  "medium",
  "hard",
]);

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  type: taskTypeEnum("type").notNull(),
  dataPayload: json("data_payload").notNull(),
  correctAnswer: text("correct_answer"),
  difficulty: taskDifficultyEnum("difficulty").notNull(),
  pointsReward: integer("points_reward").notNull().default(10),
  isGolden: boolean("is_golden").notNull().default(false),
  consensusCount: integer("consensus_count").notNull().default(0),
  finalLabel: text("final_label"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  consensusCount: true,
  finalLabel: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
