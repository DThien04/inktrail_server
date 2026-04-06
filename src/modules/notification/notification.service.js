const prisma = require("../../config/prisma");
const { emitNotificationToUser } = require("../../realtime/socket");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ALLOWED_NOTIFICATION_TYPES = new Set([
  "system",
  "story_liked",
  "chapter_liked",
  "story_commented",
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
    throw new Error("limit phải là số nguyên dương");
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
  throw new Error("Giá trị boolean không hợp lệ");
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

  if (!story) throw new Error("Không tìm thấy truyện liên quan");
};

const ensureChapterExists = async (chapterId) => {
  if (!chapterId) return;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, storyId: true },
  });

  if (!chapter) throw new Error("Không tìm thấy chương liên quan");
  return chapter;
};

const validateNotificationType = (type) => {
  if (!ALLOWED_NOTIFICATION_TYPES.has(type)) {
    throw new Error("type không hợp lệ");
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

  if (!existing) throw new Error("Không tìm thấy thông báo");

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
    message: "Đã đánh dấu tất cả thông báo là đã đọc",
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

  if (!normalizedRecipientId) throw new Error("recipient_id là bắt buộc");
  if (!normalizedType) throw new Error("type là bắt buộc");
  if (!normalizedTitle) throw new Error("title là bắt buộc");
  validateNotificationType(normalizedType);

  await ensureUserExists(normalizedRecipientId, "Không tìm thấy người dùng nhận thông báo");
  await ensureUserExists(normalizedActorId, "Không tìm thấy người dùng thực hiện hành động");
  await ensureStoryExists(normalizedStoryId);
  const chapter = await ensureChapterExists(normalizedChapterId);
  if (
    chapter &&
    normalizedStoryId &&
    chapter.storyId !== normalizedStoryId
  ) {
    throw new Error("chapter_id không thuộc story_id đã chọn");
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
    title: title || "Thông báo thử nghiệm",
    body: body || "Socket.IO đã gửi thông báo realtime tới tài khoản của bạn.",
    linkUrl,
    meta,
  });
};

module.exports = {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
  createTestNotification,
};
