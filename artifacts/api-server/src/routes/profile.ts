import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetProfileResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
} from "@workspace/api-zod";
import { db, profilesTable } from "@workspace/db";
import { ensureMemberProfile, toProfile } from "../lib/memberProfiles";

const router: IRouter = Router();

function validImageUrl(value: string | null | undefined): boolean {
  if (value == null || value === "") return true;
  if (value.startsWith("/assets/")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

router.get("/profile", async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const profile = await ensureMemberProfile(userId);
  res.json(GetProfileResponse.parse(toProfile(profile)));
});

router.patch("/profile", async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = res.locals.userId as string;
  await ensureMemberProfile(userId);
  const data = parsed.data;
  if (data.username !== undefined && !/^[a-z0-9_]{3,24}$/i.test(data.username)) {
    res.status(400).json({
      error: "اسم المستخدم يقبل الحروف الإنجليزية والأرقام والشرطة السفلية فقط.",
    });
    return;
  }
  if (!validImageUrl(data.avatarUrl) || !validImageUrl(data.coverUrl)) {
    res.status(400).json({
      error: "استخدم رابط صورة HTTPS أو صورة من أصول Zed.",
    });
    return;
  }

  const updates: Partial<typeof profilesTable.$inferInsert> = {
    ...(data.username !== undefined
      ? { username: data.username.toLowerCase() }
      : {}),
    ...(data.displayName !== undefined
      ? { displayName: data.displayName }
      : {}),
    ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
    ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
    ...(data.bio !== undefined ? { bio: data.bio } : {}),
  };

  if (Object.keys(updates).length === 0) {
    const profile = await ensureMemberProfile(userId);
    res.json(UpdateProfileResponse.parse(toProfile(profile)));
    return;
  }

  try {
    const [profile] = await db
      .update(profilesTable)
      .set(updates)
      .where(eq(profilesTable.clerkUserId, userId))
      .returning();
    res.json(UpdateProfileResponse.parse(toProfile(profile)));
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل." });
      return;
    }
    throw error;
  }
});

export default router;