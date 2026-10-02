import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  or,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateConversationBody,
  CreateConversationResponse,
  CreatePostBody,
  CreatePostResponse,
  ListConversationsResponse,
  ListFeedResponse,
  ListMessagesParams,
  ListMessagesResponse,
  SearchUsersQueryParams,
  SearchUsersResponse,
  SendMessageBody,
  SendMessageParams,
  SendMessageResponse,
  TogglePostLikeParams,
  TogglePostLikeResponse,
} from "@workspace/api-zod";
import {
  conversationsTable,
  db,
  directMessagesTable,
  postLikesTable,
  postsTable,
  profilesTable,
} from "@workspace/db";
import { ensureMemberProfile, toPublicProfile } from "../lib/memberProfiles";

const router: IRouter = Router();

function iso(value: Date): string {
  return value.toISOString();
}

async function getConversationForMember(
  conversationId: number,
  userId: string,
) {
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, conversationId),
        or(
          eq(conversationsTable.memberAId, userId),
          eq(conversationsTable.memberBId, userId),
        ),
      ),
    )
    .limit(1);
  return conversation;
}

router.get("/users", async (req, res): Promise<void> => {
  const query = SearchUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const userId = res.locals.userId as string;
  await ensureMemberProfile(userId);
  const term = query.data.q.replace(/[%_\\]/g, "");
  const profiles = await db
    .select()
    .from(profilesTable)
    .where(ilike(profilesTable.username, `%${term}%`))
    .orderBy(profilesTable.username)
    .limit(12);
  res.json(
    SearchUsersResponse.parse(
      profiles
        .filter((profile) => profile.clerkUserId !== userId)
        .map(toPublicProfile),
    ),
  );
});

router.get("/feed", async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  await ensureMemberProfile(userId);
  const rows = await db
    .select({
      id: postsTable.id,
      text: postsTable.text,
      createdAt: postsTable.createdAt,
      authorId: profilesTable.clerkUserId,
      authorUsername: profilesTable.username,
      authorDisplayName: profilesTable.displayName,
      authorAvatarUrl: profilesTable.avatarUrl,
    })
    .from(postsTable)
    .innerJoin(
      profilesTable,
      eq(postsTable.authorId, profilesTable.clerkUserId),
    )
    .orderBy(desc(postsTable.createdAt))
    .limit(40);
  const postIds = rows.map((post) => post.id);
  const likes =
    postIds.length > 0
      ? await db
          .select({
            postId: postLikesTable.postId,
            userId: postLikesTable.userId,
          })
          .from(postLikesTable)
          .where(inArray(postLikesTable.postId, postIds))
      : [];
  const likesByPost = new Map<number, { count: number; liked: boolean }>();
  for (const like of likes) {
    const value = likesByPost.get(like.postId) ?? { count: 0, liked: false };
    value.count += 1;
    if (like.userId === userId) value.liked = true;
    likesByPost.set(like.postId, value);
  }

  res.json(
    ListFeedResponse.parse(
      rows.map((post) => {
        const likeState = likesByPost.get(post.id);
        return {
          id: post.id,
          text: post.text,
          createdAt: iso(post.createdAt),
          author: {
            id: post.authorId,
            username: post.authorUsername,
            displayName: post.authorDisplayName,
            avatarUrl: post.authorAvatarUrl,
          },
          likeCount: likeState?.count ?? 0,
          likedByMe: likeState?.liked ?? false,
        };
      }),
    ),
  );
});

router.post("/feed", async (req, res): Promise<void> => {
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = res.locals.userId as string;
  await ensureMemberProfile(userId);
  const [post] = await db
    .insert(postsTable)
    .values({ authorId: userId, text: parsed.data.text.trim() })
    .returning();
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkUserId, userId))
    .limit(1);
  res.status(201).json(
    CreatePostResponse.parse({
      id: post.id,
      text: post.text,
      createdAt: iso(post.createdAt),
      author: toPublicProfile(profile),
      likeCount: 0,
      likedByMe: false,
    }),
  );
});

router.post("/feed/:postId/like", async (req, res): Promise<void> => {
  const params = TogglePostLikeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = res.locals.userId as string;
  await ensureMemberProfile(userId);
  const [post] = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(eq(postsTable.id, params.data.postId))
    .limit(1);
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [existingLike] = await db
    .select()
    .from(postLikesTable)
    .where(
      and(
        eq(postLikesTable.postId, post.id),
        eq(postLikesTable.userId, userId),
      ),
    )
    .limit(1);
  if (existingLike) {
    await db
      .delete(postLikesTable)
      .where(
        and(
          eq(postLikesTable.postId, post.id),
          eq(postLikesTable.userId, userId),
        ),
      );
  } else {
    await db.insert(postLikesTable).values({ postId: post.id, userId });
  }
  const likes = await db
    .select({ userId: postLikesTable.userId })
    .from(postLikesTable)
    .where(eq(postLikesTable.postId, post.id));
  res.json(
    TogglePostLikeResponse.parse({
      liked: !existingLike,
      likeCount: likes.length,
    }),
  );
});

router.get("/conversations", async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  await ensureMemberProfile(userId);
  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(
      or(
        eq(conversationsTable.memberAId, userId),
        eq(conversationsTable.memberBId, userId),
      ),
    )
    .orderBy(desc(conversationsTable.updatedAt));
  if (conversations.length === 0) {
    res.json(ListConversationsResponse.parse([]));
    return;
  }

  const otherIds = conversations.map((conversation) =>
    conversation.memberAId === userId
      ? conversation.memberBId
      : conversation.memberAId,
  );
  const profiles = await db
    .select()
    .from(profilesTable)
    .where(inArray(profilesTable.clerkUserId, otherIds));
  const profileById = new Map(
    profiles.map((profile) => [profile.clerkUserId, profile]),
  );
  const conversationIds = conversations.map((conversation) => conversation.id);
  const messages = await db
    .select({
      conversationId: directMessagesTable.conversationId,
      text: directMessagesTable.text,
      createdAt: directMessagesTable.createdAt,
    })
    .from(directMessagesTable)
    .where(inArray(directMessagesTable.conversationId, conversationIds))
    .orderBy(desc(directMessagesTable.createdAt));
  const lastMessageByConversation = new Map<
    number,
    { text: string; createdAt: Date }
  >();
  for (const message of messages) {
    if (!lastMessageByConversation.has(message.conversationId)) {
      lastMessageByConversation.set(message.conversationId, message);
    }
  }

  res.json(
    ListConversationsResponse.parse(
      conversations.flatMap((conversation) => {
        const otherId =
          conversation.memberAId === userId
            ? conversation.memberBId
            : conversation.memberAId;
        const profile = profileById.get(otherId);
        if (!profile) return [];
        const lastMessage = lastMessageByConversation.get(conversation.id);
        return [
          {
            id: conversation.id,
            otherUser: toPublicProfile(profile),
            lastMessage: lastMessage?.text ?? null,
            updatedAt: iso(lastMessage?.createdAt ?? conversation.updatedAt),
          },
        ];
      }),
    ),
  );
});

router.post("/conversations", async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = res.locals.userId as string;
  const ownProfile = await ensureMemberProfile(userId);
  const [recipient] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.username, parsed.data.username.toLowerCase()))
    .limit(1);
  if (!recipient || recipient.clerkUserId === userId) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  const [memberAId, memberBId] = [userId, recipient.clerkUserId].sort();
  await db
    .insert(conversationsTable)
    .values({ memberAId, memberBId })
    .onConflictDoNothing();
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.memberAId, memberAId),
        eq(conversationsTable.memberBId, memberBId),
      ),
    )
    .limit(1);
  res.status(201).json(
    CreateConversationResponse.parse({
      id: conversation.id,
      otherUser: toPublicProfile(
        recipient.clerkUserId === ownProfile.clerkUserId
          ? ownProfile
          : recipient,
      ),
      lastMessage: null,
      updatedAt: iso(conversation.updatedAt),
    }),
  );
});

router.get(
  "/conversations/:conversationId/messages",
  async (req, res): Promise<void> => {
    const params = ListMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const userId = res.locals.userId as string;
    const conversation = await getConversationForMember(
      params.data.conversationId,
      userId,
    );
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const messages = await db
      .select({
        id: directMessagesTable.id,
        text: directMessagesTable.text,
        createdAt: directMessagesTable.createdAt,
        senderId: profilesTable.clerkUserId,
        senderUsername: profilesTable.username,
        senderDisplayName: profilesTable.displayName,
        senderAvatarUrl: profilesTable.avatarUrl,
      })
      .from(directMessagesTable)
      .innerJoin(
        profilesTable,
        eq(directMessagesTable.senderId, profilesTable.clerkUserId),
      )
      .where(eq(directMessagesTable.conversationId, conversation.id))
      .orderBy(directMessagesTable.createdAt)
      .limit(200);
    res.json(
      ListMessagesResponse.parse(
        messages.map((message) => ({
          id: message.id,
          text: message.text,
          createdAt: iso(message.createdAt),
          sender: {
            id: message.senderId,
            username: message.senderUsername,
            displayName: message.senderDisplayName,
            avatarUrl: message.senderAvatarUrl,
          },
        })),
      ),
    );
  },
);

router.post(
  "/conversations/:conversationId/messages",
  async (req, res): Promise<void> => {
    const params = SendMessageParams.safeParse(req.params);
    const body = SendMessageBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "بيانات الرسالة غير صالحة." });
      return;
    }
    const userId = res.locals.userId as string;
    const conversation = await getConversationForMember(
      params.data.conversationId,
      userId,
    );
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const [message] = await db
      .insert(directMessagesTable)
      .values({
        conversationId: conversation.id,
        senderId: userId,
        text: body.data.text.trim(),
      })
      .returning();
    await db
      .update(conversationsTable)
      .set({ updatedAt: message.createdAt })
      .where(eq(conversationsTable.id, conversation.id));
    const profile = await ensureMemberProfile(userId);
    res.status(201).json(
      SendMessageResponse.parse({
        id: message.id,
        text: message.text,
        createdAt: iso(message.createdAt),
        sender: toPublicProfile(profile),
      }),
    );
  },
);

export default router;