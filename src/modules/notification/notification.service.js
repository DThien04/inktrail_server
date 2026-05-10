const prisma = require("../../config/prisma");
const { emitNotificationToUser } = require("../../realtime/socket");
const { sendPushToUser } = require("./onesignal-push.service");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const FOLLOWER_NOTIFY_BATCH_SIZE = 200;
const CHAPTER_COMMENT_NOTIFICATION_TYPE = "chapter_commented";
const ALLOWED_NOTIFICATION_TYPES = new Set([
  "system",
  "chapter_liked",
  CHAPTER_COMMENT_NOTIFICATION_TYPE,
  "chapter_published",
  "story_published",
  "admin_message",
]);

const notificationInclude = {
  actor: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      role: true,
    },
  },
  story: {
    select: {
      id: true,
      title: true,
      slug: true,
      coverUrl: true,
      status: true,
    },
  },
  chapter: {
    select: {
      id: true,
      storyId: true,
      chapterNumber: true,
      title: true,
      status: true,
    },
  },
};

const parseLimit = (value) => {
  if (value === undefined || value === null || value === "") return DEFAULT_LIMIT;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Giá»›i háº¡n phÃ¢n trang khÃ´ng há»£p lá»‡.");
  }

  return Math.min(parsed, MAX_LIMIT);
};

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Tham sá»‘ chá»‰ Ä‘Ãºng/sai khÃ´ng há»£p lá»‡.");
};

const ensureUserExists = async (userId, message) => {
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) throw new Error(message);
};

const ensureStoryExists = async (storyId) => {
  if (!storyId) return;

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true },
  });

  if (!story) throw new Error("KhÃ´ng tÃ¬m tháº¥y truyá»‡n.");
};

const ensureChapterExists = async (chapterId) => {
  if (!chapterId) return;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, storyId: true },
  });

  if (!chapter) throw new Error("KhÃ´ng tÃ¬m tháº¥y chÆ°Æ¡ng.");
  return chapter;
};

const validateNotificationType = (type) => {
  if (!ALLOWED_NOTIFICATION_TYPES.has(type)) {
    throw new Error("Loáº¡i thÃ´ng bÃ¡o khÃ´ng há»£p lá»‡.");
  }
};

const formatNotification = (notification) => ({
  id: notification.id,
  recipient_id: notification.recipientId,
  actor_id: notification.actorId,
  story_id: notification.storyId,
  chapter_id: notification.chapterId,
  type: notification.type,
  title: notification.title,
  body: notification.body,
  link_url: notification.linkUrl,
  meta: notification.meta,
  is_read: notification.isRead,
  read_at: notification.readAt,
  created_at: notification.createdAt,
  updated_at: notification.updatedAt,
  actor: notification.actor
    ? {
        id: notification.actor.id,
        display_name: notification.actor.displayName,
        avatar_url: notification.actor.avatarUrl,
        role: notification.actor.role,
      }
    : null,
  story: notification.story
    ? {
        id: notification.story.id,
        title: notification.story.title,
        slug: notification.story.slug,
        cover_url: notification.story.coverUrl,
        status: notification.story.status,
      }
    : null,
  chapter: notification.chapter
    ? {
        id: notification.chapter.id,
        story_id: notification.chapter.storyId,
        chapter_number: notification.chapter.chapterNumber,
        title: notification.chapter.title,
        status: notification.chapter.status,
      }
    : null,
});

const listNotifications = async ({ userId, limit, cursor, unreadOnly }) => {
  const take = parseLimit(limit);
  const normalizedCursor = normalizeOptionalString(cursor);
  const onlyUnread = parseBoolean(unreadOnly, false);

  const notifications = await prisma.notification.findMany({
    where: {
      recipientId: userId,
      ...(onlyUnread ? { isRead: false } : {}),
    },
    include: notificationInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(normalizedCursor
      ? {
          cursor: { id: normalizedCursor },
          skip: 1,
        }
      : {}),
  });

  const hasMore = notifications.length > take;
  const items = hasMore ? notifications.slice(0, take) : notifications;

  return {
    items: items.map(formatNotification),
    next_cursor: hasMore ? items[items.length - 1].id : null,
    has_more: hasMore,
  };
};

const getUnreadCount = async ({ userId }) => {
  const unreadCount = await prisma.notification.count({
    where: {
      recipientId: userId,
      isRead: false,
    },
  });

  return { unread_count: unreadCount };
};

const markAsRead = async ({ userId, notificationId }) => {
  const existing = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      recipientId: userId,
    },
    select: {
      id: true,
      readAt: true,
    },
  });

  if (!existing) throw new Error("KhÃ´ng tÃ¬m tháº¥y thÃ´ng bÃ¡o.");

  const notification = await prisma.notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      readAt: existing.readAt ?? new Date(),
    },
    include: notificationInclude,
  });

  return formatNotification(notification);
};

const markAllAsRead = async ({ userId }) => {
  const now = new Date();

  const result = await prisma.notification.updateMany({
    where: {
      recipientId: userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: now,
    },
  });

  return {
    message: "ÄÃ£ Ä‘Ã¡nh dáº¥u táº¥t cáº£ thÃ´ng bÃ¡o lÃ  Ä‘Ã£ Ä‘á»c.",
    updated_count: result.count,
  };
};

const createNotification = async ({
  recipientId,
  actorId,
  storyId,
  chapterId,
  type,
  title,
  body,
  linkUrl,
  meta,
}) => {
  const normalizedRecipientId = normalizeOptionalString(recipientId);
  const normalizedActorId = normalizeOptionalString(actorId);
  const normalizedStoryId = normalizeOptionalString(storyId);
  const normalizedChapterId = normalizeOptionalString(chapterId);
  const normalizedType = normalizeOptionalString(type);
  const normalizedTitle = normalizeOptionalString(title);

  if (!normalizedRecipientId) throw new Error("Vui lÃ²ng kiá»ƒm tra láº¡i thÃ´ng tin Ä‘Ã£ nháº­p.");
  if (!normalizedType) throw new Error("Vui lÃ²ng kiá»ƒm tra láº¡i thÃ´ng tin Ä‘Ã£ nháº­p.");
  if (!normalizedTitle) throw new Error("Vui lÃ²ng kiá»ƒm tra láº¡i thÃ´ng tin Ä‘Ã£ nháº­p.");
  validateNotificationType(normalizedType);

  await ensureUserExists(normalizedRecipientId, "KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i nháº­n thÃ´ng bÃ¡o.");
  await ensureUserExists(normalizedActorId, "KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i thá»±c hiá»‡n hÃ nh Ä‘á»™ng.");
  await ensureStoryExists(normalizedStoryId);
  const chapter = await ensureChapterExists(normalizedChapterId);
  if (
    chapter &&
    normalizedStoryId &&
    chapter.storyId !== normalizedStoryId
  ) {
    throw new Error("ThÃ´ng tin chÆ°Æ¡ng vÃ  truyá»‡n khÃ´ng khá»›p.");
  }

  const notification = await prisma.notification.create({
    data: {
      recipientId: normalizedRecipientId,
      actorId: normalizedActorId,
      storyId: normalizedStoryId,
      chapterId: normalizedChapterId,
      type: normalizedType,
      title: normalizedTitle,
      body: normalizeOptionalString(body),
      linkUrl: normalizeOptionalString(linkUrl),
      meta: meta ?? null,
    },
    include: notificationInclude,
  });

  const payload = formatNotification(notification);
  emitNotificationToUser(normalizedRecipientId, payload);

  try {
    await sendPushToUser({
      userId: normalizedRecipientId,
      title: payload.title,
      body: payload.body,
      data: {
        id: payload.id,
        type: payload.type,
        link_url: payload.link_url,
        story_id: payload.story_id,
        chapter_id: payload.chapter_id,
        meta: payload.meta,
      },
    });
  } catch (error) {
    console.error(
      "[onesignal-push:error]",
      JSON.stringify({
        recipient_id: normalizedRecipientId,
        notification_id: payload.id,
        message: error?.message || String(error),
      }),
    );
  }

  return payload;
};

const createTestNotification = async ({
  currentUser,
  recipientId,
  type,
  title,
  body,
  storyId,
  chapterId,
  linkUrl,
  meta,
}) => {
  const targetRecipientId =
    currentUser.role === "admin"
      ? normalizeOptionalString(recipientId) || currentUser.id
      : currentUser.id;

  return createNotification({
    recipientId: targetRecipientId,
    actorId: currentUser.id,
    storyId,
    chapterId,
    type: type || "system",
    title: title || "ThÃ´ng bÃ¡o thá»­ nghiá»‡m",
    body: body || "ÄÃ¢y lÃ  thÃ´ng bÃ¡o thá»­ gá»­i realtime tá»›i tÃ i khoáº£n cá»§a báº¡n.",
    linkUrl,
    meta,
  });
};

const getFollowerRecipientIds = async ({ authorId }) => {
  const normalizedAuthorId = normalizeOptionalString(authorId);
  if (!normalizedAuthorId) return [];

  const followers = await prisma.authorFollow.findMany({
    where: { authorId: normalizedAuthorId },
    select: { followerId: true },
  });

  return [
    ...new Set(
      followers
        .map((item) => normalizeOptionalString(item.followerId))
        .filter((id) => Boolean(id) && id !== normalizedAuthorId),
    ),
  ];
};

const notifyFollowersAboutStoryPublished = async ({
  authorId,
  storyId,
  storyTitle,
  storySlug,
}) => {
  const normalizedAuthorId = normalizeOptionalString(authorId);
  const normalizedStoryId = normalizeOptionalString(storyId);
  if (!normalizedAuthorId || !normalizedStoryId) return;

  const recipientIds = await getFollowerRecipientIds({ authorId: normalizedAuthorId });
  if (!recipientIds.length) return;

  const existingRows = await prisma.notification.findMany({
    where: {
      recipientId: { in: recipientIds },
      type: "story_published",
      storyId: normalizedStoryId,
    },
    select: { recipientId: true },
  });

  const notifiedRecipientIds = new Set(
    existingRows.map((row) => normalizeOptionalString(row.recipientId)).filter(Boolean),
  );
  const targets = recipientIds.filter((id) => !notifiedRecipientIds.has(id));
  if (!targets.length) return;

  for (let i = 0; i < targets.length; i += FOLLOWER_NOTIFY_BATCH_SIZE) {
    const chunk = targets.slice(i, i + FOLLOWER_NOTIFY_BATCH_SIZE);
    await Promise.allSettled(
      chunk.map((recipientId) =>
        createNotification({
          recipientId,
          actorId: normalizedAuthorId,
          storyId: normalizedStoryId,
          type: "story_published",
          title: "TÃ¡c giáº£ báº¡n theo dÃµi vá»«a Ä‘Äƒng truyá»‡n má»›i",
          body: normalizeOptionalString(storyTitle) || "CÃ³ má»™t truyá»‡n má»›i vá»«a Ä‘Æ°á»£c xuáº¥t báº£n.",
          linkUrl: storySlug ? `/stories/${storySlug}` : null,
          meta: {
            author_id: normalizedAuthorId,
            story_id: normalizedStoryId,
            story_title: normalizeOptionalString(storyTitle),
          },
        }),
      ),
    );
  }
};

const notifyFollowersAboutChapterPublished = async ({
  authorId,
  storyId,
  storyTitle,
  storySlug,
  chapterId,
  chapterNumber,
  chapterTitle,
}) => {
  const normalizedAuthorId = normalizeOptionalString(authorId);
  const normalizedStoryId = normalizeOptionalString(storyId);
  const normalizedChapterId = normalizeOptionalString(chapterId);
  if (!normalizedAuthorId || !normalizedStoryId || !normalizedChapterId) return;

  const recipientIds = await getFollowerRecipientIds({ authorId: normalizedAuthorId });
  if (!recipientIds.length) return;

  const existingRows = await prisma.notification.findMany({
    where: {
      recipientId: { in: recipientIds },
      type: "chapter_published",
      chapterId: normalizedChapterId,
    },
    select: { recipientId: true },
  });

  const notifiedRecipientIds = new Set(
    existingRows.map((row) => normalizeOptionalString(row.recipientId)).filter(Boolean),
  );
  const targets = recipientIds.filter((id) => !notifiedRecipientIds.has(id));
  if (!targets.length) return;

  const chapterLabel =
    Number.isInteger(chapterNumber) && chapterNumber > 0
      ? `ChÆ°Æ¡ng ${chapterNumber}`
      : "ChÆ°Æ¡ng má»›i";
  const defaultBody = [chapterLabel, normalizeOptionalString(chapterTitle)]
    .filter(Boolean)
    .join(": ");

  for (let i = 0; i < targets.length; i += FOLLOWER_NOTIFY_BATCH_SIZE) {
    const chunk = targets.slice(i, i + FOLLOWER_NOTIFY_BATCH_SIZE);
    await Promise.allSettled(
      chunk.map((recipientId) =>
        createNotification({
          recipientId,
          actorId: normalizedAuthorId,
          storyId: normalizedStoryId,
          chapterId: normalizedChapterId,
          type: "chapter_published",
          title: "TÃ¡c giáº£ báº¡n theo dÃµi vá»«a ra chÆ°Æ¡ng má»›i",
          body: defaultBody || "CÃ³ chÆ°Æ¡ng má»›i vá»«a Ä‘Æ°á»£c xuáº¥t báº£n.",
          linkUrl:
            storySlug && normalizedChapterId
              ? `/stories/${storySlug}/chapters/${normalizedChapterId}`
              : null,
          meta: {
            author_id: normalizedAuthorId,
            story_id: normalizedStoryId,
            story_title: normalizeOptionalString(storyTitle),
            chapter_id: normalizedChapterId,
            chapter_number:
              Number.isInteger(chapterNumber) && chapterNumber > 0
                ? chapterNumber
                : null,
            chapter_title: normalizeOptionalString(chapterTitle),
          },
        }),
      ),
    );
  }
};

module.exports = {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
  createTestNotification,
  notifyFollowersAboutStoryPublished,
  notifyFollowersAboutChapterPublished,
};

