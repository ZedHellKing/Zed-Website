import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { profilesTable } from "./profiles";

export const postsTable = pgTable("zed_posts", {
  id: serial("id").primaryKey(),
  authorId: text("author_id")
    .notNull()
    .references(() => profilesTable.clerkUserId, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PostRecord = typeof postsTable.$inferSelect;