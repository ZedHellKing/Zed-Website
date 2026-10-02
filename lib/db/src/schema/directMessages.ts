import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";
import { profilesTable } from "./profiles";

export const directMessagesTable = pgTable("zed_direct_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  senderId: text("sender_id")
    .notNull()
    .references(() => profilesTable.clerkUserId, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DirectMessageRecord = typeof directMessagesTable.$inferSelect;