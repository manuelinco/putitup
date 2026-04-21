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

export const accessTypeEnum = pgEnum("access_type", [
  "free",
  "ads",
  "premium",
]);

export const datasetsTable = pgTable("datasets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  qualityScore: real("quality_score").notNull().default(0),
  accessType: accessTypeEnum("access_type").notNull(),
  price: real("price"),
  adsRequired: integer("ads_required"),
  tokenCost: integer("token_cost").notNull().default(0),
  workflowMode: text("workflow_mode").notNull().default("consensus"),
  status: text("status").notNull().default("draft"),
  votesRequired: integer("votes_required").notNull().default(3),
  consensusThreshold: real("consensus_threshold").notNull().default(0.8),
  supervisorId: integer("supervisor_id"),
  importMode: text("import_mode").notNull().default("manual"),
  requestedTaskCount: integer("requested_task_count").notNull().default(0),
  approvedRecordCount: integer("approved_record_count").notNull().default(0),
  nightlyPublishedAt: timestamp("nightly_published_at", { withTimezone: true }),
  downloadCount: integer("download_count").notNull().default(0),
  size: text("size"),
  recordCount: integer("record_count"),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertDatasetSchema = createInsertSchema(datasetsTable).omit({
  id: true,
  createdAt: true,
  downloadCount: true,
});
export type InsertDataset = z.infer<typeof insertDatasetSchema>;
export type Dataset = typeof datasetsTable.$inferSelect;
