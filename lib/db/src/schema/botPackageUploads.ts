import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { botsTable } from "./bots";
import { profilesTable } from "./profiles";

export const botPackageUploadsTable = pgTable(
  "zed_bot_package_uploads",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => profilesTable.clerkUserId, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull().unique(),
    originalName: text("original_name").notNull(),
    size: integer("size").notNull(),
    contentType: text("content_type").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
);

export type BotPackageUpload = typeof botPackageUploadsTable.$inferSelect;