import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { profilesTable } from "./profiles";

export const conversationsTable = pgTable(
  "zed_conversations",
  {
    id: serial("id").primaryKey(),
    memberAId: text("member_a_id")
      .notNull()
      .references(() => profilesTable.clerkUserId, { onDelete: "cascade" }),
    memberBId: text("member_b_id")
      .notNull()
      .references(() => profilesTable.clerkUserId, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("zed_conversation_members_idx").on(
      table.memberAId,
      table.memberBId,
    ),
  ],
);

export type ConversationRecord = typeof conversationsTable.$inferSelect;