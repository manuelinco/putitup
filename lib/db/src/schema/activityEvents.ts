import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  json,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const activityEventTypeEnum = pgEnum("activity_event_type", [
  "task_completed",
  "level_up",
  "dataset_downloaded",
  "payout",
  "streak_achieved",
  "mission_completed",
]);

export const activityEventsTable = pgTable("activity_events", {
  id: serial("id").primaryKey(),
  type: activityEventTypeEnum("type").notNull(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  username: text("username").notNull(),
  description: text("description").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertActivityEventSchema = createInsertSchema(
  activityEventsTable,
).omit({ id: true, createdAt: true });
export type InsertActivityEvent = z.infer<typeof insertActivityEventSchema>;
export type ActivityEvent = typeof activityEventsTable.$inferSelect;
