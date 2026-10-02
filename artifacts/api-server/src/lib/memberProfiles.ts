import { eq } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";

export async function ensureMemberProfile(userId: string) {
  const [existing] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId))
    .limit(1);

  if (existing) return existing;

  const suffix = userId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-16);
  const username = `zed_${suffix || "member"}`;
  await db
    .insert(profilesTable)
    .values({
      clerkUserId: userId,
      username,
      displayName: "عضو جديد",
    })
    .onConflictDoNothing({ target: profilesTable.clerkUserId });

  const [created] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId))
    .limit(1);

  if (!created) {
    throw new Error("Unable to create member profile");
  }

  return created;
}

export function toPublicProfile(profile: typeof profilesTable.$inferSelect) {
  return {
    id: profile.clerkUserId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  };
}

export function toProfile(profile: typeof profilesTable.$inferSelect) {
  return {
    ...toPublicProfile(profile),
    coverUrl: profile.coverUrl,
    bio: profile.bio,
  };
}