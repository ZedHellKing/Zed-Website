import { and, count, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateBotBody,
  CreateBotResponse,
  CompleteBotPackageUploadBody,
  CompleteBotPackageUploadParams,
  CompleteBotPackageUploadResponse,
  DeleteBotParams,
  GetDashboardResponse,
  ListBotLogsParams,
  ListBotLogsResponse,
  ListBotsResponse,
  RequestBotPackageUploadBody,
  RequestBotPackageUploadParams,
  RequestBotPackageUploadResponse,
  RunBotActionBody,
  RunBotActionParams,
  RunBotActionResponse,
  UpdateBotBody,
  UpdateBotParams,
  UpdateBotResponse,
} from "@workspace/api-zod";
import {
  botLogsTable,
  botPackageUploadsTable,
  botsTable,
  db,
  postsTable,
} from "@workspace/db";
import { ensureMemberProfile } from "../lib/memberProfiles";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const supportedCommands = ["help", "status", "uptime", "logs", "clear"];
const maxPackageSize = 25 * 1024 * 1024;
const objectStorage = new ObjectStorageService();

function iso(value: Date): string {
  return value.toISOString();
}

function serializeBot(bot: typeof botsTable.$inferSelect) {
  return {
    id: bot.id,
    name: bot.name,
    platform: bot.platform,
    pageName: bot.pageName,
    status: bot.status,
    mode: bot.mode,
    packageName: bot.packageName,
    packageSize: bot.packageSize,
    packageUploadedAt: bot.packageUploadedAt
      ? iso(bot.packageUploadedAt)
      : null,
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

router.post(
  "/bots/:botId/uploads/request-url",
  async (req, res): Promise<void> => {
    const params = RequestBotPackageUploadParams.safeParse(req.params);
    const body = RequestBotPackageUploadBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "بيانات الملف غير صالحة." });
      return;
    }
    const userId = res.locals.userId as string;
    const bot = await getOwnedBot(params.data.botId, userId);
    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const { size, contentType } = body.data;
    const name =
      body.data.name.replaceAll("\\", "/").split("/").pop() || "bot.zip";
    if (!name.toLowerCase().endsWith(".zip") || size > maxPackageSize) {
      res.status(400).json({
        error: "ارفع ملف مشروع بصيغة ZIP لا يتجاوز حجمه 25 ميغابايت.",
      });
      return;
    }
    const allowedTypes = new Set([
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
      "application/zip-compressed",
    ]);
    if (!allowedTypes.has(contentType.toLowerCase())) {
      res.status(400).json({ error: "نوع الملف غير مدعوم." });
      return;
    }

    try {
      await ensureMemberProfile(userId);
      const uploadUrl = await objectStorage.getObjectEntityUploadURL();
      const objectPath = objectStorage.normalizeObjectEntityPath(uploadUrl);
      await db.insert(botPackageUploadsTable).values({
        botId: bot.id,
        ownerId: userId,
        objectPath,
        originalName: name,
        size,
        contentType,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });
      res.json(
        RequestBotPackageUploadResponse.parse({ uploadURL: uploadUrl, objectPath }),
      );
    } catch (error) {
      logger.error({ err: error }, "Unable to create bot package upload URL");
      res.status(503).json({
        error: "تعذر تجهيز مساحة رفع الملف حالياً. حاول مرة أخرى لاحقاً.",
      });
    }
  },
);

router.post(
  "/bots/:botId/uploads/complete",
  async (req, res): Promise<void> => {
    const params = CompleteBotPackageUploadParams.safeParse(req.params);
    const body = CompleteBotPackageUploadBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "مرجع رفع الملف غير صالح." });
      return;
    }

    const userId = res.locals.userId as string;
    const bot = await getOwnedBot(params.data.botId, userId);
    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }
    const [ticket] = await db
      .select()
      .from(botPackageUploadsTable)
      .where(
        and(
          eq(botPackageUploadsTable.botId, bot.id),
          eq(botPackageUploadsTable.ownerId, userId),
          eq(botPackageUploadsTable.objectPath, body.data.objectPath),
        ),
      )
      .limit(1);
    if (!ticket) {
      res.status(404).json({ error: "Upload ticket not found" });
      return;
    }
    if (ticket.status !== "pending") {
      res.status(409).json({ error: "تم إرفاق هذا الملف مسبقاً." });
      return;
    }
    if (ticket.expiresAt.getTime() < Date.now()) {
      res.status(410).json({ error: "انتهت صلاحية رابط الرفع. اطلب رابطاً جديداً." });
      return;
    }

    try {
      const objectFile = await objectStorage.getObjectEntityFile(ticket.objectPath);
      const [metadata] = await objectFile.getMetadata();
      const actualSize = Number(metadata.size ?? 0);
      if (actualSize !== ticket.size || actualSize > maxPackageSize) {
        res.status(400).json({
          error: "حجم الملف المرفوع لا يطابق الحجم المتوقع.",
        });
        return;
      }
      await objectStorage.trySetObjectEntityAclPolicy(ticket.objectPath, {
        owner: userId,
        visibility: "private",
      });

      const uploadedAt = new Date();
      const [updatedBot] = await db
        .update(botsTable)
        .set({
          packagePath: ticket.objectPath,
          packageName: ticket.originalName,
          packageSize: actualSize,
          packageUploadedAt: uploadedAt,
        })
        .where(and(eq(botsTable.id, bot.id), eq(botsTable.ownerId, userId)))
        .returning();
      await db
        .update(botPackageUploadsTable)
        .set({ status: "complete", completedAt: uploadedAt })
        .where(eq(botPackageUploadsTable.id, ticket.id));
      await appendLog(
        bot.id,
        "warning",
        `تم حفظ ${ticket.originalName} في التخزين الخاص. لم يتم تشغيل الكود المرفوع.`,
      );

      if (bot.packagePath && bot.packagePath !== ticket.objectPath) {
        try {
          await objectStorage.deleteObjectEntity(bot.packagePath);
        } catch (error) {
          logger.warn({ err: error, botId: bot.id }, "Could not remove replaced bot package");
        }
      }
      res.json(CompleteBotPackageUploadResponse.parse(serializeBot(updatedBot)));
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(400).json({ error: "لم يكتمل رفع الملف إلى التخزين." });
        return;
      }
      logger.error({ err: error, botId: bot.id }, "Unable to finalize bot package");
      res.status(503).json({
        error: "تعذر التحقق من الملف المرفوع. حاول مرة أخرى لاحقاً.",
      });
    }
  },
);

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