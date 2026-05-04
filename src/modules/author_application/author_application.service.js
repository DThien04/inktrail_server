const prisma = require("../../config/prisma");
const notificationService = require("../notification/notification.service");

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_ACCOUNT_AGE_DAYS = 30;
const MIN_ACTIVE_DAYS_30D = 10;
const MIN_QUALIFIED_SESSIONS_30D = 20;
const MIN_TRUST_SCORE = 70;
const REJECT_COOLDOWN_DAYS = 7;
const SUBMIT_SPAM_COOLDOWN_SECONDS = 20;

const normalizeText = (value) => String(value ?? "").trim();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function hashUserIdToLockKey(userId) {
  const input = String(userId || '');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash | 0);
}

function formatApplication(item) {
  return {
    id: item.id,
    user_id: item.userId,
    pen_name: item.penName,
    bio: item.bio,
    reason: item.reason,
    sample_links: item.sampleLinks ?? [],
    status: item.status,
    trust_score_snapshot: item.trustScoreSnapshot,
    eligibility_snapshot: item.eligibilitySnapshot,
    reviewed_by_id: item.reviewedById,
    reviewed_at: item.reviewedAt,
    review_note: item.reviewNote,
    reject_cooldown_until: item.rejectCooldownUntil,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function calculateTrustScore({
  accountAgeDays,
  activeDays30d,
  qualifiedSessions30d,
  commentsPosted,
  removedReportsCount,
  pendingReportsCount,
  aiRejectedComments30d,
}) {
  const activityScore = clamp(activeDays30d * 2 + qualifiedSessions30d * 0.6, 0, 40);
  const communityScore = clamp(commentsPosted * 0.8, 0, 25);
  const reliabilityBase = clamp(accountAgeDays / 2, 0, 25);
  const pendingPenalty = pendingReportsCount > 0 ? 10 : 0;
  const removedPenalty = clamp(removedReportsCount * 5, 0, 25);
  const aiRejectedPenalty = clamp(aiRejectedComments30d * 4, 0, 24);
  const score = Math.round(
    activityScore +
      communityScore +
      reliabilityBase -
      pendingPenalty -
      removedPenalty -
      aiRejectedPenalty,
  );
  return clamp(score, 0, 100);
}

async function buildEligibilitySnapshot({ userId }) {
  const now = new Date();
  const from30d = new Date(now.getTime() - 30 * DAY_MS);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, createdAt: true },
  });
  if (!user) throw new Error("KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng");

  const [sessions, commentsPosted, removedReportsCount, pendingReportsCount, aiRejectedComments30d, latestRejected] =
    await Promise.all([
      prisma.storyReadSession.findMany({
        where: {
          userId,
          countedAt: { gte: from30d },
          timeSpentSeconds: { gte: 20 },
          maxScrollPercent: { gte: 40 },
        },
        select: { countedAt: true },
      }),
      prisma.chapterComment.count({
        where: {
          userId,
          createdAt: { gte: from30d },
          isHidden: false,
        },
      }),
      prisma.chapterCommentReport.count({
        where: {
          status: "removed",
          comment: { userId },
        },
      }),
      prisma.chapterCommentReport.count({
        where: {
          status: "pending",
          comment: { userId },
        },
      }),
      prisma.chapterComment.count({
        where: {
          userId,
          createdAt: { gte: from30d },
          moderationStatus: "rejected",
        },
      }),
      prisma.authorApplication.findFirst({
        where: {
          userId,
          status: "rejected",
        },
        orderBy: { createdAt: "desc" },
        select: { rejectCooldownUntil: true },
      }),
    ]);

  const activeDaySet = new Set(
    sessions.map((item) => new Date(item.countedAt).toISOString().slice(0, 10)),
  );

  const accountAgeDays = Math.floor((now.getTime() - user.createdAt.getTime()) / DAY_MS);
  const qualifiedSessions30d = sessions.length;
  const activeDays30d = activeDaySet.size;

  const trustScore = calculateTrustScore({
    accountAgeDays,
    activeDays30d,
    qualifiedSessions30d,
    commentsPosted,
    removedReportsCount,
    pendingReportsCount,
    aiRejectedComments30d,
  });

  const cooldownUntil = latestRejected?.rejectCooldownUntil || null;
  const inCooldown = cooldownUntil ? cooldownUntil.getTime() > now.getTime() : false;

  const conditions = {
    min_account_age_days: {
      required: MIN_ACCOUNT_AGE_DAYS,
      value: accountAgeDays,
      passed: accountAgeDays >= MIN_ACCOUNT_AGE_DAYS,
    },
    min_active_days_30d: {
      required: MIN_ACTIVE_DAYS_30D,
      value: activeDays30d,
      passed: activeDays30d >= MIN_ACTIVE_DAYS_30D,
    },
    min_qualified_sessions_30d: {
      required: MIN_QUALIFIED_SESSIONS_30D,
      value: qualifiedSessions30d,
      passed: qualifiedSessions30d >= MIN_QUALIFIED_SESSIONS_30D,
    },
    no_pending_comment_reports: {
      required: 0,
      value: pendingReportsCount,
      passed: pendingReportsCount === 0,
    },
    low_ai_rejected_comments_30d: {
      required: "<= 1",
      value: aiRejectedComments30d,
      passed: aiRejectedComments30d <= 1,
    },
    trust_score_threshold: {
      required: MIN_TRUST_SCORE,
      value: trustScore,
      passed: trustScore >= MIN_TRUST_SCORE,
    },
    cooldown_completed: {
      required: true,
      value: !inCooldown,
      passed: !inCooldown,
    },
  };

  const canApply = Object.values(conditions).every((item) => item.passed) && user.role === "reader";

  return {
    user_role: user.role,
    trust_score: trustScore,
    can_apply: canApply,
    cooldown_until: cooldownUntil,
    metrics: {
      account_age_days: accountAgeDays,
      active_days_30d: activeDays30d,
      qualified_sessions_30d: qualifiedSessions30d,
      comments_posted_30d: commentsPosted,
      removed_reports_count: removedReportsCount,
      pending_reports_count: pendingReportsCount,
      ai_rejected_comments_30d: aiRejectedComments30d,
    },
    conditions,
  };
}

async function getMyEligibility({ userId }) {
  return buildEligibilitySnapshot({ userId });
}

async function submitApplication({ userId, penName, bio, reason, sampleLinks }) {
  const normalizedPenName = normalizeText(penName);
  if (!normalizedPenName) throw new Error("But danh khong duoc de trong");
  if (normalizedPenName.length > 80) throw new Error("But danh toi da 80 ky tu");

  const normalizedBio = normalizeText(bio);
  const normalizedReason = normalizeText(reason);
  if (normalizedBio.length > 1000) throw new Error("Bio toi da 1000 ky tu");
  if (normalizedReason.length > 1000) throw new Error("Ly do toi da 1000 ky tu");

  const links = Array.isArray(sampleLinks)
    ? sampleLinks.map((item) => normalizeText(item)).filter(Boolean).slice(0, 10)
    : [];

  const created = await prisma.$transaction(async (tx) => {
    const lockKey = hashUserIdToLockKey(userId);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(918273, ${lockKey})`;

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new Error("Khong tim thay nguoi dung");
    if (user.role !== "reader") {
      throw new Error("Chi tai khoan reader moi duoc nop don len author");
    }

    const activePending = await tx.authorApplication.findFirst({
      where: { userId, status: "pending" },
      select: { id: true },
    });
    if (activePending) {
      throw new Error("Ban da co don dang ky dang cho duyet");
    }

    const latestApplication = await tx.authorApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (latestApplication) {
      const gapSeconds = Math.floor((Date.now() - latestApplication.createdAt.getTime()) / 1000);
      if (gapSeconds < SUBMIT_SPAM_COOLDOWN_SECONDS) {
        const waitSeconds = SUBMIT_SPAM_COOLDOWN_SECONDS - gapSeconds;
        throw new Error(`Ban thao tac qua nhanh. Vui long thu lai sau ${waitSeconds} giay.`);
      }
    }

    const eligibility = await buildEligibilitySnapshot({ userId });
    if (!eligibility.can_apply) {
      throw new Error("Ban chua du dieu kien dang ky tac gia");
    }

    return tx.authorApplication.create({
      data: {
        userId,
        penName: normalizedPenName,
        bio: normalizedBio || null,
        reason: normalizedReason || null,
        sampleLinks: links,
        trustScoreSnapshot: eligibility.trust_score,
        eligibilitySnapshot: eligibility,
        status: "pending",
      },
    });
  });

  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true },
  });
  await Promise.all(
    admins.map((admin) =>
      notificationService.createNotification({
        recipientId: admin.id,
        actorId: created.userId,
        storyId: null,
        chapterId: null,
        type: "admin_message",
        title: "Co don dang ky tac gia moi",
        body: `${created.penName} vua nop don Reader -> Author, can ban xet duyet.`,
        linkUrl: "/admin/author-applications",
        meta: {
          author_application_id: created.id,
          decision: "pending",
        },
      }),
    ),
  );

  return formatApplication(created);
}
async function getMyApplications({ userId, limit = 20 }) {
  const safeLimit = clamp(Number.parseInt(String(limit || 20), 10) || 20, 1, 50);
  const rows = await prisma.authorApplication.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });
  return rows.map(formatApplication);
}

async function listAdminApplications({ status = "pending", limit = 50 }) {
  const safeLimit = clamp(Number.parseInt(String(limit || 50), 10) || 50, 1, 100);
  const allowedStatus = new Set(["pending", "approved", "rejected", "all"]);
  const normalizedStatus = normalizeText(status).toLowerCase();

  const rows = await prisma.authorApplication.findMany({
    where: allowedStatus.has(normalizedStatus) && normalizedStatus !== "all"
      ? { status: normalizedStatus }
      : {},
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          createdAt: true,
        },
      },
      reviewedBy: {
        select: { id: true, displayName: true, email: true },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: safeLimit,
  });

  return rows.map((item) => ({
    ...formatApplication(item),
    user: item.user
      ? {
          id: item.user.id,
          email: item.user.email,
          display_name: item.user.displayName,
          role: item.user.role,
          created_at: item.user.createdAt,
        }
      : null,
    reviewed_by: item.reviewedBy
      ? {
          id: item.reviewedBy.id,
          display_name: item.reviewedBy.displayName,
          email: item.reviewedBy.email,
        }
      : null,
  }));
}

async function getApplicationByIdForAdmin({ applicationId }) {
  const item = await prisma.authorApplication.findUnique({
    where: { id: applicationId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          createdAt: true,
        },
      },
      reviewedBy: {
        select: { id: true, displayName: true, email: true },
      },
    },
  });
  if (!item) throw new Error("KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n Ä‘Äƒng kÃ½ tÃ¡c giáº£");

  return {
    ...formatApplication(item),
    user: item.user
      ? {
          id: item.user.id,
          email: item.user.email,
          display_name: item.user.displayName,
          role: item.user.role,
          created_at: item.user.createdAt,
        }
      : null,
    reviewed_by: item.reviewedBy
      ? {
          id: item.reviewedBy.id,
          display_name: item.reviewedBy.displayName,
          email: item.reviewedBy.email,
        }
      : null,
  };
}

async function approveApplication({ applicationId, adminId, reviewNote }) {
  const note = normalizeText(reviewNote);
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.authorApplication.findUnique({
      where: { id: applicationId },
      include: { user: { select: { id: true, role: true } } },
    });

    if (!item) throw new Error("KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n Ä‘Äƒng kÃ½ tÃ¡c giáº£");
    if (item.status !== "pending") throw new Error("Chá»‰ cÃ³ thá»ƒ duyá»‡t Ä‘Æ¡n Ä‘ang chá»");
    if (!item.user) throw new Error("KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i ná»™p Ä‘Æ¡n");

    if (item.user.role !== "author") {
      await tx.user.update({
        where: { id: item.user.id },
        data: { role: "author" },
      });
    }

    const updated = await tx.authorApplication.update({
      where: { id: item.id },
      data: {
        status: "approved",
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNote: note || null,
        rejectCooldownUntil: null,
      },
    });

    return updated;
  });

  await notificationService.createNotification({
    recipientId: result.userId,
    actorId: adminId,
    storyId: null,
    chapterId: null,
    type: "admin_message",
    title: "ÄÆ¡n Ä‘Äƒng kÃ½ tÃ¡c giáº£ Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t",
    body: "Báº¡n Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t trá»Ÿ thÃ nh tÃ¡c giáº£. HÃ£y báº¯t Ä‘áº§u táº¡o truyá»‡n/chÆ°Æ¡ng Ä‘áº§u tiÃªn.",
    linkUrl: "/dashboard",
    meta: {
      author_application_id: result.id,
      decision: "approved",
    },
  });

  return formatApplication(result);
}

async function rejectApplication({ applicationId, adminId, reviewNote }) {
  const note = normalizeText(reviewNote);
  if (!note) throw new Error("Vui lÃ²ng nháº­p lÃ½ do tá»« chá»‘i");
  if (note.length > 1000) throw new Error("LÃ½ do tá»« chá»‘i tá»‘i Ä‘a 1000 kÃ½ tá»±");

  const cooldownUntil = new Date(Date.now() + REJECT_COOLDOWN_DAYS * DAY_MS);

  const existing = await prisma.authorApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, status: true, userId: true },
  });
  if (!existing) throw new Error("KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n Ä‘Äƒng kÃ½ tÃ¡c giáº£");
  if (existing.status !== "pending") throw new Error("Chá»‰ cÃ³ thá»ƒ tá»« chá»‘i Ä‘Æ¡n Ä‘ang chá»");

  const updated = await prisma.authorApplication.update({
    where: { id: applicationId },
    data: {
      status: "rejected",
      reviewedById: adminId,
      reviewedAt: new Date(),
      reviewNote: note,
      rejectCooldownUntil: cooldownUntil,
    },
  });

  await notificationService.createNotification({
    recipientId: updated.userId,
    actorId: adminId,
    storyId: null,
    chapterId: null,
    type: "admin_message",
    title: "ÄÆ¡n Ä‘Äƒng kÃ½ tÃ¡c giáº£ bá»‹ tá»« chá»‘i",
    body: `ÄÆ¡n cá»§a báº¡n chÆ°a Ä‘Æ°á»£c duyá»‡t. Báº¡n cÃ³ thá»ƒ ná»™p láº¡i sau ${REJECT_COOLDOWN_DAYS} ngÃ y.`,
    linkUrl: "/dashboard",
    meta: {
      author_application_id: updated.id,
      decision: "rejected",
      review_note: note,
      reject_cooldown_until: cooldownUntil,
    },
  });

  return formatApplication(updated);
}

module.exports = {
  getMyEligibility,
  submitApplication,
  getMyApplications,
  listAdminApplications,
  getApplicationByIdForAdmin,
  approveApplication,
  rejectApplication,
};





