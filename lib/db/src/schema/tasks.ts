import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  json,
  pgEnum,
  real,
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
  datasetId: integer("dataset_id"),
  type: taskTypeEnum("type").notNull(),
  dataPayload: json("data_payload").notNull(),
  correctAnswer: text("correct_answer"),
  difficulty: taskDifficultyEnum("difficulty").notNull(),
  pointsReward: integer("points_reward").notNull().default(10),
  isGolden: boolean("is_golden").notNull().default(false),
  consensusCount: integer("consensus_count").notNull().default(0),
  finalLabel: text("final_label"),
  status: text("status").notNull().default("active"),
  reviewStage: text("review_stage").notNull().default("labeling"),
  requiredVotes: integer("required_votes").notNull().default(3),
  consensusThreshold: real("consensus_threshold").notNull().default(0.8),
  supervisorId: integer("supervisor_id"),
  supervisorApprovedAt: timestamp("supervisor_approved_at", { withTimezone: true }),
  adminApprovedAt: timestamp("admin_approved_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  taskValuePoints: integer("task_value_points").notNull().default(10),
  operatorRewardTon: real("operator_reward_ton").notNull().default(0.00001),
  supervisorRewardTon: real("supervisor_reward_ton").notNull().default(0.0001),
  rewardReleased: boolean("reward_released").notNull().default(false),
  rawSource: text("raw_source"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  consensusCount: true,
  finalLabel: true,
  status: true,
  reviewStage: true,
  approvedAt: true,
  rewardReleased: true,
});
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
