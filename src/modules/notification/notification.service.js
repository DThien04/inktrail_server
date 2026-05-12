const prisma = require("../../config/prisma");
const { emitNotificationToUser, emitAdminBroadcastPublic } = require("../../realtime/socket");
const {
  sendPushToUser,
  sendPushToPublishPublicAudience,
} = require("./onesignal-push.service");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/**
 * Thông báo follower: tuần tự từng người (tránh dồn Prisma/socket).
 * Cứ N bản ghi nhường event loop — không cần hàng đợi Redis.
 */
const FOLLOWER_NOTIFY_YIELD_INTERVAL = 25;
const ADMIN_PUSH_BATCH_SIZE = 40;
const BROADCAST_LOG_DEFAULT_PAGE_SIZE = 20;
const BROADCAST_LOG_MAX_PAGE_SIZE = 100;
const PUBLIC_BROADCAST_LOG_MAX = 50;
const CHAPTER_COMMENT_NOTIFICATION_TYPE = "chapter_commented";
const PUSH_NOTIFICATION_TYPES = new Set([
  "chapter_published",
  "story_published",
]);
const ALLOWED_NOTIFICATION_TYPES = new Set([
  "system",
  "chapter_liked",
  CHAPTER_COMMENT_NOTIFICATION_TYPE,
  "chapter_published",
  "story_published",
  "admin_message",
]);
/**
 * Các loại thông báo có giá trị với admin (hiển thị trong bell ở admin UI).
 * Bỏ qua `admin_message` (broadcast do admin tự gửi), tương tác reader-driven
 * (`chapter_liked`, `chapter_commented`) và các sự kiện xuất bản (`chapter_published`, `story_published`).
 */
const ADMIN_RELEVANT_NOTIFICATION_TYPES = new Set(["system"]);

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
    throw new Error("Giới hạn phân trang không hợp lệ.");
  }

  return Math.min(parsed, MAX_LIMIT);
};

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const extractStorySlugFromLinkUrl = (linkUrl) => {
  const raw = normalizeOptionalString(linkUrl);
  if (!raw) return null;
  const segments = raw
    .split("/")
    .map((segment) => String(segment || "").trim())
    .filter(Boolean);
  if (segments.length >= 2 && segments[0] === "stories") {
    return segments[1];
  }
  return null;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Tham số chỉ đúng/sai không hợp lệ.");
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

  if (!story) throw new Error("Không tìm thấy truyện.");
};

const ensureChapterExists = async (chapterId) => {
  if (!chapterId) return;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, storyId: true },
  });

  if (!chapter) throw new Error("Không tìm thấy chương.");
  return chapter;
};

const validateNotificationType = (type) => {
  if (!ALLOWED_NOTIFICATION_TYPES.has(type)) {
    throw new Error("Loại thông báo không hợp lệ.");
  }
};

const shouldSendPushNotification = (type) =>
  PUSH_NOTIFICATION_TYPES.has(type);

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

const listNotifications = async ({
  userId,
  limit,
  cursor,
  unreadOnly,
  forAdmin,
}) => {
  const take = parseLimit(limit);
  const normalizedCursor = normalizeOptionalString(cursor);
  const onlyUnread = parseBoolean(unreadOnly, false);
  const restrictForAdmin = parseBoolean(forAdmin, false);

  const notifications = await prisma.notification.findMany({
    where: {
      recipientId: userId,
      ...(onlyUnread ? { isRead: false } : {}),
      ...(restrictForAdmin
        ? { type: { in: Array.from(ADMIN_RELEVANT_NOTIFICATION_TYPES) } }
        : {}),
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

const getUnreadCount = async ({ userId, forAdmin }) => {
  const restrictForAdmin = parseBoolean(forAdmin, false);
  const unreadCount = await prisma.notification.count({
    where: {
      recipientId: userId,
      isRead: false,
      ...(restrictForAdmin
        ? { type: { in: Array.from(ADMIN_RELEVANT_NOTIFICATION_TYPES) } }
        : { type: { not: "admin_message" } }),
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

  if (!existing) throw new Error("Không tìm thấy thông báo.");

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
    message: "Đã đánh dấu tất cả thông báo là đã đọc.",
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
  sendPush,
}) => {
  const normalizedRecipientId = normalizeOptionalString(recipientId);
  const normalizedActorId = normalizeOptionalString(actorId);
  const normalizedStoryId = normalizeOptionalString(storyId);
  const normalizedChapterId = normalizeOptionalString(chapterId);
  const normalizedType = normalizeOptionalString(type);
  const normalizedTitle = normalizeOptionalString(title);

  if (!normalizedRecipientId) throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
  if (!normalizedType) throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
  if (!normalizedTitle) throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
  validateNotificationType(normalizedType);

  await ensureUserExists(normalizedRecipientId, "Không tìm thấy người nhận thông báo.");
  await ensureUserExists(normalizedActorId, "Không tìm thấy người thực hiện hành động.");
  await ensureStoryExists(normalizedStoryId);
  const chapter = await ensureChapterExists(normalizedChapterId);
  if (
    chapter &&
    normalizedStoryId &&
    chapter.storyId !== normalizedStoryId
  ) {
    throw new Error("Thông tin chương và truyện không khớp.");
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

  const wantPush =
    sendPush === true
      ? true
      : sendPush === false
        ? false
        : shouldSendPushNotification(payload.type);

  if (wantPush) {
    try {
      await sendPushToUser({
        userId: normalizedRecipientId,
        title: payload.title,
        body: payload.body,
        data: {
          id: payload.id,
          type: payload.type,
          link_url: payload.link_url,
          story_slug:
            normalizeOptionalString(payload?.meta?.story_slug) ||
            extractStorySlugFromLinkUrl(payload.link_url),
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
  }

  return payload;
};

const getAllRegisteredUserIds = async () => {
  const rows = await prisma.user.findMany({
    select: { id: true },
  });
  return rows.map((r) => normalizeOptionalString(r.id)).filter(Boolean);
};

const adminSendNotifications = async ({
  currentUser,
  title,
  body,
}) => {
  if (normalizeOptionalString(currentUser?.role) !== "admin") {
    throw new Error("Chỉ quản trị viên mới được thực hiện thao tác này.");
  }

  const normalizedTitle = normalizeOptionalString(title);
  const normalizedBody = normalizeOptionalString(body);
  if (!normalizedTitle) throw new Error("Vui lòng nhập tiêu đề.");
  if (!normalizedBody) throw new Error("Vui lòng nhập nội dung.");

  const ids = await getAllRegisteredUserIds();

  const actorId = normalizeOptionalString(currentUser.id);
  if (!actorId) throw new Error("Phiên đăng nhập không hợp lệ.");

  const failures = [];
  let created = 0;

  for (let i = 0; i < ids.length; i += ADMIN_PUSH_BATCH_SIZE) {
    const chunk = ids.slice(i, i + ADMIN_PUSH_BATCH_SIZE);
    const settled = await Promise.allSettled(
      chunk.map((recipientId) =>
        createNotification({
          recipientId,
          actorId,
          type: "admin_message",
          title: normalizedTitle,
          body: normalizedBody,
          linkUrl: null,
          meta: null,
          sendPush: false,
        }),
      ),
    );

    settled.forEach((result, idx) => {
      const rid = chunk[idx];
      if (result.status === "fulfilled") {
        created += 1;
      } else {
        const message =
          result.reason?.message ||
          String(result.reason || "Lỗi không xác định");
        failures.push({ recipient_id: rid, message });
      }
    });
  }

  try {
    await sendPushToPublishPublicAudience({
      title: normalizedTitle,
      body: normalizedBody,
      data: {
        type: "admin_message",
      },
    });
  } catch (error) {
    console.error(
      "[onesignal-push:publish-public]",
      JSON.stringify({
        message: error?.message || String(error),
      }),
    );
  }

  try {
    const row = await prisma.adminBroadcastLog.create({
      data: {
        actorId,
        title: normalizedTitle,
        body: normalizedBody,
        totalAccounts: ids.length,
        createdCount: created,
        failedCount: failures.length,
      },
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
      },
    });
    emitAdminBroadcastPublic({
      id: row.id,
      title: row.title,
      body: row.body,
      created_at: row.createdAt,
    });
  } catch (error) {
    console.error(
      "[admin-broadcast-log:create]",
      JSON.stringify({
        message: error?.message || String(error),
      }),
    );
  }

  return {
    summary: {
      total: ids.length,
      created,
      failed: failures.length,
    },
    failures: failures.slice(0, 50),
  };
};

const listAdminBroadcastLogs = async ({ query, sort, order, page, pageSize }) => {
  const keyword = normalizeOptionalString(query);
  const rawPage = Number(page);
  const rawSize = Number(pageSize);
  const safePage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const safeSize =
    Number.isInteger(rawSize) && rawSize > 0
      ? Math.min(rawSize, BROADCAST_LOG_MAX_PAGE_SIZE)
      : BROADCAST_LOG_DEFAULT_PAGE_SIZE;

  const sortKey = (normalizeOptionalString(sort) || "created_at").toLowerCase();
  const orderDir = normalizeOptionalString(order)?.toLowerCase() === "asc" ? "asc" : "desc";

  const sortMap = {
    created_at: "createdAt",
    title: "title",
    total_accounts: "totalAccounts",
    created_count: "createdCount",
    failed_count: "failedCount",
  };
  const prismaField = sortMap[sortKey] || "createdAt";

  const where = keyword
    ? {
        OR: [
          { title: { contains: keyword, mode: "insensitive" } },
          { body: { contains: keyword, mode: "insensitive" } },
        ],
      }
    : {};

  const [total, rows] = await Promise.all([
    prisma.adminBroadcastLog.count({ where }),
    prisma.adminBroadcastLog.findMany({
      where,
      orderBy: { [prismaField]: orderDir },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
      include: {
        actor: {
          select: { id: true, displayName: true, email: true },
        },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      created_at: row.createdAt,
      total_accounts: row.totalAccounts,
      created_count: row.createdCount,
      failed_count: row.failedCount,
      actor: row.actor
        ? {
            id: row.actor.id,
            display_name: row.actor.displayName,
            email: row.actor.email,
          }
        : null,
    })),
    total,
    page: safePage,
    page_size: safeSize,
  };
};

const listPublicAdminBroadcastLogs = async ({ limit }) => {
  const raw = Number(limit);
  const take =
    Number.isInteger(raw) && raw > 0
      ? Math.min(raw, PUBLIC_BROADCAST_LOG_MAX)
      : 30;

  const rows = await prisma.adminBroadcastLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
    },
  });

  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      created_at: row.createdAt,
    })),
  };
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
    body: body || "Đây là thông báo thử gửi realtime tới tài khoản của bạn.",
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

async function createFollowerNotificationsSequential(targets, factory) {
  for (let index = 0; index < targets.length; index += 1) {
    const recipientId = targets[index];
    try {
      await factory(recipientId);
    } catch (_err) {
      // Giống Promise.allSettled rejected: bỏ qua lỗi từng người.
    }
    const done = index + 1;
    if (
      done % FOLLOWER_NOTIFY_YIELD_INTERVAL === 0 &&
      done < targets.length
    ) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

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

  await createFollowerNotificationsSequential(targets, (recipientId) =>
    createNotification({
      recipientId,
      actorId: normalizedAuthorId,
      storyId: normalizedStoryId,
      type: "story_published",
      title: "Tác giả bạn theo dõi vừa đăng truyện mới",
      body: normalizeOptionalString(storyTitle) || "Có một truyện mới vừa được xuất bản.",
      linkUrl: storySlug ? `/stories/${storySlug}` : null,
      meta: {
        author_id: normalizedAuthorId,
        story_id: normalizedStoryId,
        story_slug: normalizeOptionalString(storySlug),
        story_title: normalizeOptionalString(storyTitle),
      },
    }),
  );
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
      ? `Chương ${chapterNumber}`
      : "Chương mới";
  const defaultBody = [chapterLabel, normalizeOptionalString(chapterTitle)]
    .filter(Boolean)
    .join(": ");

  await createFollowerNotificationsSequential(targets, (recipientId) =>
    createNotification({
      recipientId,
      actorId: normalizedAuthorId,
      storyId: normalizedStoryId,
      chapterId: normalizedChapterId,
      type: "chapter_published",
      title: "Tác giả bạn theo dõi vừa ra chương mới",
      body: defaultBody || "Có chương mới vừa được xuất bản.",
      linkUrl:
        storySlug && normalizedChapterId
          ? `/stories/${storySlug}/chapters/${normalizedChapterId}`
          : null,
      meta: {
        author_id: normalizedAuthorId,
        story_id: normalizedStoryId,
        story_slug: normalizeOptionalString(storySlug),
        story_title: normalizeOptionalString(storyTitle),
        chapter_id: normalizedChapterId,
        chapter_number:
          Number.isInteger(chapterNumber) && chapterNumber > 0
            ? chapterNumber
            : null,
        chapter_title: normalizeOptionalString(chapterTitle),
      },
    }),
  );
};

module.exports = {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
  createTestNotification,
  adminSendNotifications,
  listAdminBroadcastLogs,
  listPublicAdminBroadcastLogs,
  notifyFollowersAboutStoryPublished,
  notifyFollowersAboutChapterPublished,
};

