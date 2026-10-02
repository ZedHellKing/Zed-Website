import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const profilesTable = pgTable("zed_profiles", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  coverUrl: text("cover_url"),
  bio: text("bio"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Profile = typeof profilesTable.$inferSelect;