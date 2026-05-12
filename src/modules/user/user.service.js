const prisma = require("../../config/prisma");

const normalizeText = (value) => String(value ?? "").trim();

const ALLOWED_ROLES = new Set(["admin", "reader"]);
const ALLOWED_STATUSES = new Set(["all", "active", "locked"]);

const isUserCurrentlyLocked = (user) => {
  if (!user?.isLocked) return false;
  if (!user.lockedUntil) return true;
  return new Date(user.lockedUntil).getTime() > Date.now();
};

const formatUser = (user) => ({
  id: user.id,
  email: user.email,
  display_name: user.displayName,
  role: user.role,
  created_at: user.createdAt,
  updated_at: user.updatedAt,
  is_locked: user.isLocked,
  locked_at: user.lockedAt,
  locked_until: user.lockedUntil,
  locked_reason: user.lockedReason,
  locked_by: user.lockedBy
    ? { id: user.lockedBy.id, display_name: user.lockedBy.displayName }
    : null,
});

const formatLockLog = (log) => ({
  id: log.id,
  user_id: log.userId,
  actor_id: log.actorId,
  actor: log.actor
    ? { id: log.actor.id, display_name: log.actor.displayName }
    : null,
  action: log.action,
  reason: log.reason,
  locked_until: log.lockedUntil,
  created_at: log.createdAt,
});

const listAdminUsers = async ({ query, role, status }) => {
  const normalizedQuery = normalizeText(query);
  const normalizedRole = normalizeText(role).toLowerCase();
  const normalizedStatus = normalizeText(status).toLowerCase();

  const statusFilter = ALLOWED_STATUSES.has(normalizedStatus)
    ? normalizedStatus
    : "all";

  const lockedNow = {
    isLocked: true,
    OR: [{ lockedUntil: null }, { lockedUntil: { gt: new Date() } }],
  };

  const where = {
    ...(ALLOWED_ROLES.has(normalizedRole) ? { role: normalizedRole } : {}),
    ...(statusFilter === "locked" ? lockedNow : {}),
    ...(statusFilter === "active"
      ? { OR: [{ isLocked: false }, { lockedUntil: { lte: new Date() } }] }
      : {}),
    ...(normalizedQuery
      ? {
          AND: [
            {
              OR: [
                { email: { contains: normalizedQuery, mode: "insensitive" } },
                { displayName: { contains: normalizedQuery, mode: "insensitive" } },
              ],
            },
          ],
        }
      : {}),
  };

  const users = await prisma.user.findMany({
    where,
    include: {
      lockedBy: { select: { id: true, displayName: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return users.map(formatUser);
};

const parseLockedUntil = (rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;
  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Thời hạn khóa không hợp lệ.");
  }
  if (date.getTime() <= Date.now()) {
    throw new Error("Thời hạn khóa phải lớn hơn thời điểm hiện tại.");
  }
  return date;
};

const lockUser = async ({
  targetUserId,
  actorId,
  reason,
  lockedUntil,
  caseId = null,
  tx = null,
}) => {
  if (!targetUserId) throw new Error("Thiếu ID người dùng cần khóa.");
  if (targetUserId === actorId) {
    throw new Error("Bạn không thể tự khóa tài khoản của chính mình.");
  }

  const trimmedReason = normalizeText(reason);
  if (!trimmedReason) throw new Error("Vui lòng nhập lý do khóa tài khoản.");

  const parsedLockedUntil = parseLockedUntil(lockedUntil);

  const db = tx ?? prisma;

  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new Error("Không tìm thấy người dùng cần khóa.");

  const now = new Date();

  const runOps = async (client) => {
    const updated = await client.user.update({
      where: { id: targetUserId },
      data: {
        isLocked: true,
        lockedAt: now,
        lockedById: actorId,
        lockedReason: trimmedReason,
        lockedUntil: parsedLockedUntil,
      },
      include: {
        lockedBy: { select: { id: true, displayName: true } },
      },
    });
    await client.userLockLog.create({
      data: {
        userId: targetUserId,
        actorId,
        action: "lock",
        reason: trimmedReason,
        lockedUntil: parsedLockedUntil,
        caseId,
      },
    });
    await client.refreshToken.deleteMany({ where: { userId: targetUserId } });
    return updated;
  };

  const updated = tx
    ? await runOps(tx)
    : await prisma.$transaction((client) => runOps(client));

  return formatUser(updated);
};

const unlockUser = async ({
  targetUserId,
  actorId,
  caseId = null,
  action = "unlock",
  tx = null,
}) => {
  if (!targetUserId) throw new Error("Thiếu ID người dùng cần mở khóa.");

  const db = tx ?? prisma;

  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new Error("Không tìm thấy người dùng cần mở khóa.");
  if (!target.isLocked) {
    throw new Error("Tài khoản này hiện không bị khóa.");
  }

  const runOps = async (client) => {
    const updated = await client.user.update({
      where: { id: targetUserId },
      data: {
        isLocked: false,
        lockedAt: null,
        lockedById: null,
        lockedReason: null,
        lockedUntil: null,
      },
      include: {
        lockedBy: { select: { id: true, displayName: true } },
      },
    });
    await client.userLockLog.create({
      data: {
        userId: targetUserId,
        actorId,
        action,
        caseId,
      },
    });
    return updated;
  };

  const updated = tx
    ? await runOps(tx)
    : await prisma.$transaction((client) => runOps(client));

  return formatUser(updated);
};

const getUserViolationSummary = async (userId) => {
  if (!userId) throw new Error("Thiếu ID người dùng.");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      isLocked: true,
      lockedAt: true,
      lockedUntil: true,
      lockedReason: true,
      lockedBy: { select: { id: true, displayName: true } },
    },
  });
  if (!user) throw new Error("Không tìm thấy người dùng.");

  const [storyResolved, chapterResolved, commentResolved, accountLockCases] =
    await Promise.all([
      prisma.reportCase.count({
        where: {
          targetType: "story",
          status: "resolved",
          resolutionAction: "story_hidden",
          targetId: { in: await getStoryIdsByAuthor(userId) },
        },
      }),
      prisma.reportCase.count({
        where: {
          targetType: "chapter",
          status: "resolved",
          resolutionAction: "chapter_hidden",
          targetId: { in: await getChapterIdsByAuthor(userId) },
        },
      }),
      prisma.reportCase.count({
        where: {
          targetType: "chapter_comment",
          status: "resolved",
          resolutionAction: "comment_removed",
          targetId: { in: await getCommentIdsByUser(userId) },
        },
      }),
      prisma.reportCase.count({
        where: {
          accountLockApplied: true,
          accountLockedUserId: userId,
        },
      }),
    ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      role: user.role,
      is_locked: isUserCurrentlyLocked(user),
      locked_at: user.lockedAt,
      locked_until: user.lockedUntil,
      locked_reason: user.lockedReason,
      locked_by: user.lockedBy
        ? { id: user.lockedBy.id, display_name: user.lockedBy.displayName }
        : null,
    },
    counts: {
      stories_hidden: storyResolved,
      chapters_hidden: chapterResolved,
      comments_removed: commentResolved,
      account_lock_cases: accountLockCases,
      total_content_violations:
        storyResolved + chapterResolved + commentResolved,
    },
  };
};

const getStoryIdsByAuthor = async (authorId) => {
  const stories = await prisma.story.findMany({
    where: { authorId },
    select: { id: true },
  });
  return stories.map((row) => row.id);
};

const getChapterIdsByAuthor = async (authorId) => {
  const chapters = await prisma.chapter.findMany({
    where: { story: { authorId } },
    select: { id: true },
  });
  return chapters.map((row) => row.id);
};

const getCommentIdsByUser = async (userId) => {
  const comments = await prisma.chapterComment.findMany({
    where: { userId },
    select: { id: true },
  });
  return comments.map((row) => row.id);
};

const listUserLockLogs = async (userId) => {
  if (!userId) throw new Error("Thiếu ID người dùng.");
  const logs = await prisma.userLockLog.findMany({
    where: { userId },
    include: { actor: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return logs.map(formatLockLog);
};

const APPEAL_STATUS_VALUES = new Set(["pending", "accepted", "rejected"]);

const formatLockAppeal = (appeal) => ({
  id: appeal.id,
  user_id: appeal.userId,
  reason: appeal.reason,
  status: appeal.status,
  submitted_at: appeal.submittedAt,
  resolved_at: appeal.resolvedAt,
  resolved_by_id: appeal.resolvedById,
  resolver_note: appeal.resolverNote,
  user: appeal.user
    ? {
        id: appeal.user.id,
        email: appeal.user.email,
        display_name: appeal.user.displayName,
        avatar_url: appeal.user.avatarUrl,
        is_locked: appeal.user.isLocked,
        locked_at: appeal.user.lockedAt,
        locked_until: appeal.user.lockedUntil,
        locked_reason: appeal.user.lockedReason,
      }
    : null,
  resolver: appeal.resolver
    ? {
        id: appeal.resolver.id,
        display_name: appeal.resolver.displayName,
      }
    : null,
});

const listLockAppeals = async ({ status = "all", page = 1, limit = 20 } = {}) => {
  const normalizedStatus =
    typeof status === "string" && APPEAL_STATUS_VALUES.has(status.toLowerCase())
      ? status.toLowerCase()
      : "all";
  const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));

  const where = {};
  if (normalizedStatus !== "all") {
    where.status = normalizedStatus;
  }

  const [total, appeals] = await Promise.all([
    prisma.userLockAppeal.count({ where }),
    prisma.userLockAppeal.findMany({
      where,
      orderBy: [{ submittedAt: "desc" }],
      skip: (parsedPage - 1) * parsedLimit,
      take: parsedLimit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
            isLocked: true,
            lockedAt: true,
            lockedUntil: true,
            lockedReason: true,
          },
        },
        resolver: { select: { id: true, displayName: true } },
      },
    }),
  ]);

  return {
    items: appeals.map(formatLockAppeal),
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      total_pages: Math.max(1, Math.ceil(total / parsedLimit)),
    },
  };
};

const resolveLockAppeal = async ({
  appealId,
  actorId,
  action,
  note,
}) => {
  const normalizedAction = String(action || "").toLowerCase();
  if (!["accept", "dismiss"].includes(normalizedAction)) {
    throw new Error("Thao tác khiếu nại không hợp lệ.");
  }

  const appeal = await prisma.userLockAppeal.findUnique({
    where: { id: appealId },
    include: {
      user: { select: { id: true, isLocked: true } },
    },
  });
  if (!appeal) throw new Error("Không tìm thấy khiếu nại.");
  if (appeal.status !== "pending") {
    throw new Error("Khiếu nại này đã được xử lý trước đó.");
  }

  const targetStatus = normalizedAction === "accept" ? "accepted" : "rejected";
  const now = new Date();

  if (normalizedAction === "accept") {
    await prisma.$transaction(async (tx) => {
      if (appeal.user?.isLocked) {
        await tx.user.update({
          where: { id: appeal.userId },
          data: {
            isLocked: false,
            lockedAt: null,
            lockedById: null,
            lockedReason: null,
            lockedUntil: null,
          },
        });
        await tx.userLockLog.create({
          data: {
            userId: appeal.userId,
            actorId,
            action: "unlock_via_appeal",
          },
        });
      }
      await tx.userLockAppeal.update({
        where: { id: appealId },
        data: {
          status: targetStatus,
          resolvedAt: now,
          resolvedById: actorId,
          resolverNote: normalizeText(note) || null,
        },
      });
    }, { timeout: 15000, maxWait: 10000 });
  } else {
    await prisma.userLockAppeal.update({
      where: { id: appealId },
      data: {
        status: targetStatus,
        resolvedAt: now,
        resolvedById: actorId,
        resolverNote: normalizeText(note) || null,
      },
    });
  }

  const refreshed = await prisma.userLockAppeal.findUnique({
    where: { id: appealId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          isLocked: true,
          lockedAt: true,
          lockedUntil: true,
          lockedReason: true,
        },
      },
      resolver: { select: { id: true, displayName: true } },
    },
  });

  return formatLockAppeal(refreshed);
};

module.exports = {
  listAdminUsers,
  lockUser,
  unlockUser,
  listUserLockLogs,
  getUserViolationSummary,
  listLockAppeals,
  resolveLockAppeal,
  isUserCurrentlyLocked,
};
