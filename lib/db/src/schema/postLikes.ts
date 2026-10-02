import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { postsTable } from "./posts";
import { profilesTable } from "./profiles";

export const postLikesTable = pgTable(
  "zed_post_likes",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => profilesTable.clerkUserId, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.userId] })],
);