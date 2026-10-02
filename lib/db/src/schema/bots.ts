import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { profilesTable } from "./profiles";

export const botsTable = pgTable("zed_bots", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => profilesTable.clerkUserId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  platform: text("platform").notNull().default("messenger"),
  pageName: text("page_name"),
  status: text("status").notNull().default("setup_required"),
  mode: text("mode").notNull().default("simulation"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BotRecord = typeof botsTable.$inferSelect;