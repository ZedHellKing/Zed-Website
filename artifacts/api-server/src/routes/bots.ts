import { and, count, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  BotActionResult,
  CreateBotBody,
  CreateBotResponse,
  DeleteBotParams,
  GetDashboardResponse,
  ListBotLogsParams,
  ListBotLogsResponse,
  ListBotsResponse,
  RunBotActionBody,
  RunBotActionParams,
  RunBotActionResponse,
  UpdateBotBody,
  UpdateBotParams,
  UpdateBotResponse,
} from "@workspace/api-zod";
import {
  botLogsTable,
  botsTable,
  db,
  postsTable,
} from "@workspace/db";
import { ensureMemberProfile } from "../lib/memberProfiles";

const router: IRouter = Router();
const supportedCommands = ["help", "status", "uptime", "logs", "clear"];

function iso(value: Date): string {
  return value.toISOString();
}

function serializeBot(bot: typeof botsTable.$inferSelect) {
  return {
    ...bot,
    createdAt: iso(bot.createdAt),
  };
}

function serializeLog(log: typeof botLogsTable.$inferSelect) {
  return {
    ...log,
    createdAt: iso(log.createdAt),
  };
}

async function getOwnedBot(botId: number, ownerId: string) {
  const [bot] = await db
    .select()
    .from(botsTable)
    .where(and(eq(botsTable.id, botId), eq(botsTable.ownerId, ownerId)))
    .limit(1);
  return bot;
}

async function appendLog(
  botId: number,
  level: "info" | "success" | "warning" | "error",
  message: string,
) {
  const [log] = await db
    .insert(botLogsTable)
    .values({ botId, level, message })
    .returning();
  return log;
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  await ensureMemberProfile(userId);
  const [botCountRow] = await db
    .select({ value: count() })
    .from(botsTable)
    .where(eq(botsTable.ownerId, userId));
  const [runningCountRow] = await db
    .select({ value: count() })
    .from(botsTable)
    .where(and(eq(botsTable.ownerId, userId), eq(botsTable.status, "running")));
  const [postCountRow] = await db
    .select({ value: count() })
    .from(postsTable)
    .where(eq(postsTable.authorId, userId));

  const recentLogs = await db
    .select({
      id: botLogsTable.id,
      message: botLogsTable.message,
      createdAt: botLogsTable.createdAt,
    })
    .from(botLogsTable)
    .innerJoin(botsTable, eq(botLogsTable.botId, botsTable.id))
    .where(eq(botsTable.ownerId, userId))
    .orderBy(desc(botLogsTable.createdAt))
    .limit(5);

  const recentPosts = await db
    .select({
      id: postsTable.id,
      text: postsTable.text,
      createdAt: postsTable.createdAt,
    })
    .from(postsTable)
    .where(eq(postsTable.authorId, userId))
    .orderBy(desc(postsTable.createdAt))
    .limit(5);

  const recentActivity = [
    ...recentLogs.map((item) => ({
      id: `log-${item.id}`,
      text: item.message,
      createdAt: iso(item.createdAt),
      kind: "bot" as const,
    })),
    ...recentPosts.map((item) => ({
      id: `post-${item.id}`,
      text: item.text,
      createdAt: iso(item.createdAt),
      kind: "community" as const,
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  res.json(
    GetDashboardResponse.parse({
      botCount: botCountRow?.value ?? 0,
      runningCount: runningCountRow?.value ?? 0,
      communityPostCount: postCountRow?.value ?? 0,
      recentActivity,
    }),
  );
});

router.get("/bots", async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  await ensureMemberProfile(userId);
  const bots = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.ownerId, userId))
    .orderBy(desc(botsTable.createdAt));
  res.json(ListBotsResponse.parse(bots.map(serializeBot)));
});

router.post("/bots", async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const parsed = CreateBotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureMemberProfile(userId);
  const [bot] = await db
    .insert(botsTable)
    .values({ ownerId: userId, name: parsed.data.name })
    .returning();
  await appendLog(
    bot.id,
    "warning",
    "تم إنشاء مساحة بوت تجريبية. ربط Meta وتشغيل عامل دائم غير مُعدّ بعد.",
  );
  res.status(201).json(CreateBotResponse.parse(serializeBot(bot)));
});

router.patch("/bots/:botId", async (req, res): Promise<void> => {
  const params = UpdateBotParams.safeParse(req.params);
  const body = UpdateBotBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "بيانات البوت غير صالحة." });
    return;
  }
  const userId = res.locals.userId as string;
  const [bot] = await db
    .update(botsTable)
    .set({ name: body.data.name })
    .where(
      and(eq(botsTable.id, params.data.botId), eq(botsTable.ownerId, userId)),
    )
    .returning();
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  res.json(UpdateBotResponse.parse(serializeBot(bot)));
});

router.delete("/bots/:botId", async (req, res): Promise<void> => {
  const params = DeleteBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = res.locals.userId as string;
  const [deleted] = await db
    .delete(botsTable)
    .where(
      and(eq(botsTable.id, params.data.botId), eq(botsTable.ownerId, userId)),
    )
    .returning({ id: botsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/bots/:botId/logs", async (req, res): Promise<void> => {
  const params = ListBotLogsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = res.locals.userId as string;
  const bot = await getOwnedBot(params.data.botId, userId);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  const logs = await db
    .select()
    .from(botLogsTable)
    .where(eq(botLogsTable.botId, bot.id))
    .orderBy(desc(botLogsTable.createdAt))
    .limit(100);
  res.json(ListBotLogsResponse.parse(logs.reverse().map(serializeLog)));
});

router.post("/bots/:botId/actions", async (req, res): Promise<void> => {
  const params = RunBotActionParams.safeParse(req.params);
  const body = RunBotActionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Console action is invalid." });
    return;
  }
  const userId = res.locals.userId as string;
  const bot = await getOwnedBot(params.data.botId, userId);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  let status = bot.status;
  let level: "info" | "success" | "warning" = "info";
  let message = "";

  if (body.data.action === "start" || body.data.action === "restart") {
    status = "running";
    level = "success";
    message =
      "بدأت المحاكاة. لا يوجد اتصال بصفحة Meta أو عامل تشغيل دائم في هذه النسخة.";
  } else if (body.data.action === "stop") {
    status = "stopped";
    message = "توقفت المحاكاة التجريبية.";
  } else {
    const command = (body.data.command ?? "").trim().toLowerCase();
    if (!supportedCommands.includes(command)) {
      res.status(400).json({
        error: `الأوامر المتاحة: ${supportedCommands.join(", ")}.`,
      });
      return;
    }
    const commandMessages: Record<string, string> = {
      help: `أوامر العرض المتاحة: ${supportedCommands.join(", ")}.`,
      status: `الحالة: ${status === "running" ? "محاكاة نشطة" : status}. لا يوجد عامل Meta فعلي.`,
      uptime: "مدة هذه الجلسة لا تمثل وقت تشغيل بوت حقيقي.",
      logs: "استخدم سجل الأحداث أعلاه لعرض رسائل المحاكاة.",
      clear: "تم تحديث عرض الطرفية؛ السجلات المحفوظة لم تُحذف.",
    };
    message = commandMessages[command];
  }

  const [updated] = await db
    .update(botsTable)
    .set({ status })
    .where(and(eq(botsTable.id, bot.id), eq(botsTable.ownerId, userId)))
    .returning();
  const log = await appendLog(bot.id, level, message);
  res.json(
    RunBotActionResponse.parse({
      bot: serializeBot(updated),
      log: serializeLog(log),
      supportedCommands,
    }),
  );
});

export default router;