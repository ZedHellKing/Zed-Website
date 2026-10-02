import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { botsTable } from "./bots";

export const botLogsTable = pgTable("zed_bot_logs", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id")
    .notNull()
    .references(() => botsTable.id, { onDelete: "cascade" }),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BotLogRecord = typeof botLogsTable.$inferSelect;