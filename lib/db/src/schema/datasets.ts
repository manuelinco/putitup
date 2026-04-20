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
