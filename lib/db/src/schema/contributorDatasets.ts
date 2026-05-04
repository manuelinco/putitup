import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  json,
  real,
} from "drizzle-orm/pg-core";

export const contributorDatasetsTable = pgTable("contributor_datasets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull().default("text"),
  labelingInstructions: text("labeling_instructions"),
  labelOptions: json("label_options"),
  totalItems: integer("total_items").notNull().default(0),
  labeledItems: integer("labeled_items").notNull().default(0),
  qualityScore: real("quality_score"),
  status: text("status").notNull().default("pending"),
  datasetId: integer("dataset_id"),
  rewardTon: real("reward_ton"),
  rewardEnergy: integer("reward_energy"),
  rewardPaid: boolean("reward_paid").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contributorItemsTable = pgTable("contributor_items", {
  id: serial("id").primaryKey(),
  contributorDatasetId: integer("contributor_dataset_id").notNull(),
  taskId: integer("task_id"),
  content: text("content").notNull(),
  contentType: text("content_type").notNull().default("text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContributorDataset = typeof contributorDatasetsTable.$inferSelect;
export type ContributorItem = typeof contributorItemsTable.$inferSelect;
