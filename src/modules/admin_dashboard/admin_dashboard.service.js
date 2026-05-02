const prisma = require("../../config/prisma");

const DAY_MS = 24 * 60 * 60 * 1000;
const VN_UTC_OFFSET_HOURS = 7;
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;
const REPORT_CASE_SLA_HOURS = 24;
const dashboardCache = new Map();

function parseRangeDays(range) {
  if (String(range || "").toLowerCase() === "30d") return 30;
  return 7;
}

function getCachedValue(cacheKey) {
  const cached = dashboardCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    dashboardCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCachedValue(cacheKey, value) {
  dashboardCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
  });
}

function getVNDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((item) => item.type === "year")?.value || 0);
  const month = Number(parts.find((item) => item.type === "month")?.value || 0);
  const day = Number(parts.find((item) => item.type === "day")?.value || 0);

  return { year, month, day };
}

function formatVNDateKey(date) {
  const { year, month, day } = getVNDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function vnStartOfDayUtc(date) {
  const { year, month, day } = getVNDateParts(date);
  return new Date(
    Date.UTC(year, month - 1, day, -VN_UTC_OFFSET_HOURS, 0, 0, 0),
  );
}

function buildDayBuckets(days) {
  const todayVnStartUtc = vnStartOfDayUtc(new Date());
  const from = new Date(todayVnStartUtc.getTime() - (days - 1) * DAY_MS);
  const buckets = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(from.getTime() + i * DAY_MS);
    const key = formatVNDateKey(date);
    buckets.push({ key, date });
  }
  return { from, to: new Date(todayVnStartUtc.getTime() + DAY_MS), buckets };
}

function toDayKey(dateValue) {
  return formatVNDateKey(new Date(dateValue));
}

async function getAdminDashboardSummary() {
  const cacheKey = "dashboard_summary";
  const cached = getCachedValue(cacheKey);
  if (cached) return cached;

  const [
    totalUsers,
    totalAuthors,
    totalStories,
    totalChapters,
    openReportCases,
    pendingAppeals,
    storyModeration,
    chapterModeration,
    draftStories,
    publishedStories,
    draftChapters,
    publishedChapters,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "author" } }),
    prisma.story.count(),
    prisma.chapter.count(),
    prisma.reportCase.count({ where: { status: "pending" } }),
    prisma.reportCase.count({ where: { appealStatus: "pending" } }),
    prisma.story.groupBy({
      by: ["moderationStatus"],
      _count: { _all: true },
    }),
    prisma.chapter.groupBy({
      by: ["moderationStatus"],
      _count: { _all: true },
    }),
    prisma.story.count({ where: { status: "draft" } }),
    prisma.story.count({ where: { status: "published" } }),
    prisma.chapter.count({ where: { status: "draft" } }),
    prisma.chapter.count({ where: { status: "published" } }),
  ]);

  const moderationTemplate = {
    pending: 0,
    approved: 0,
    rejected: 0,
    failed: 0,
  };

  const storyModerationCounts = { ...moderationTemplate };
  storyModeration.forEach((item) => {
    storyModerationCounts[item.moderationStatus] = item._count._all;
  });

  const chapterModerationCounts = { ...moderationTemplate };
  chapterModeration.forEach((item) => {
    chapterModerationCounts[item.moderationStatus] = item._count._all;
  });

  const result = {
    totals: {
      users: totalUsers,
      authors: totalAuthors,
      stories: totalStories,
      chapters: totalChapters,
      open_report_cases: openReportCases,
      pending_appeals: pendingAppeals,
    },
    moderation_snapshot: {
      stories: storyModerationCounts,
      chapters: chapterModerationCounts,
    },
    content_status: {
      stories: {
        draft: draftStories,
        published: publishedStories,
      },
      chapters: {
        draft: draftChapters,
        published: publishedChapters,
      },
    },
  };

  setCachedValue(cacheKey, result);
  return result;
}

async function getAdminDashboardTrends({ range }) {
  const days = parseRangeDays(range);
  const cacheKey = `dashboard_trends_${days}`;
  const cached = getCachedValue(cacheKey);
  if (cached) return cached;

  const { from, to, buckets } = buildDayBuckets(days);

  const [createdCases, resolvedCases, publishedStoriesRows, publishedChaptersRows] =
    await Promise.all([
      prisma.reportCase.findMany({
        where: { createdAt: { gte: from, lt: to } },
        select: { createdAt: true },
      }),
      prisma.reportCase.findMany({
        where: { resolvedAt: { gte: from, lt: to } },
        select: { resolvedAt: true },
      }),
      prisma.story.findMany({
        where: {
          status: "published",
          updatedAt: { gte: from, lt: to },
        },
        select: { updatedAt: true },
      }),
      prisma.chapter.findMany({
        where: {
          status: "published",
          publishedAt: { gte: from, lt: to },
        },
        select: { publishedAt: true },
      }),
    ]);

  const createdMap = new Map();
  createdCases.forEach((row) => {
    const key = toDayKey(row.createdAt);
    createdMap.set(key, (createdMap.get(key) || 0) + 1);
  });

  const resolvedMap = new Map();
  resolvedCases.forEach((row) => {
    if (!row.resolvedAt) return;
    const key = toDayKey(row.resolvedAt);
    resolvedMap.set(key, (resolvedMap.get(key) || 0) + 1);
  });

  const publishedStoryMap = new Map();
  publishedStoriesRows.forEach((row) => {
    const key = toDayKey(row.updatedAt);
    publishedStoryMap.set(key, (publishedStoryMap.get(key) || 0) + 1);
  });

  const publishedChapterMap = new Map();
  publishedChaptersRows.forEach((row) => {
    if (!row.publishedAt) return;
    const key = toDayKey(row.publishedAt);
    publishedChapterMap.set(key, (publishedChapterMap.get(key) || 0) + 1);
  });

  const result = {
    range_days: days,
    points: buckets.map((bucket) => ({
      date: bucket.key,
      report_cases_created: createdMap.get(bucket.key) || 0,
      report_cases_resolved: resolvedMap.get(bucket.key) || 0,
      stories_published: publishedStoryMap.get(bucket.key) || 0,
      chapters_published: publishedChapterMap.get(bucket.key) || 0,
    })),
  };

  setCachedValue(cacheKey, result);
  return result;
}

async function getAdminDashboardQueues({ limit = 10 }) {
  const parsedLimit = Number.isFinite(Number(limit))
    ? Math.min(Math.max(Number(limit), 1), 50)
    : 10;
  const cacheKey = `dashboard_queues_${parsedLimit}`;
  const cached = getCachedValue(cacheKey);
  if (cached) return cached;

  const queueRows = await prisma.reportCase.findMany({
    where: {
      OR: [{ status: "pending" }, { appealStatus: "pending" }],
    },
    orderBy: [{ lastReportedAt: "desc" }],
    take: Math.max(parsedLimit * 5, 100),
    select: {
      id: true,
      targetType: true,
      targetId: true,
      status: true,
      priority: true,
      riskScore: true,
      reportCount: true,
      uniqueReporterCount: true,
      appealStatus: true,
      lastReportedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const storyIds = queueRows
    .filter((item) => item.targetType === "story")
    .map((item) => item.targetId);
  const chapterIds = queueRows
    .filter((item) => item.targetType === "chapter")
    .map((item) => item.targetId);
  const commentIds = queueRows
    .filter((item) => item.targetType === "chapter_comment")
    .map((item) => item.targetId);

  const [stories, chapters, comments] = await Promise.all([
    storyIds.length
      ? prisma.story.findMany({
          where: { id: { in: storyIds } },
          select: { id: true, title: true, slug: true },
        })
      : Promise.resolve([]),
    chapterIds.length
      ? prisma.chapter.findMany({
          where: { id: { in: chapterIds } },
          select: {
            id: true,
            title: true,
            chapterNumber: true,
            story: { select: { id: true, title: true, slug: true } },
          },
        })
      : Promise.resolve([]),
    commentIds.length
      ? prisma.chapterComment.findMany({
          where: { id: { in: commentIds } },
          select: {
            id: true,
            content: true,
            chapter: {
              select: {
                id: true,
                chapterNumber: true,
                title: true,
                story: { select: { id: true, title: true, slug: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const storyMap = new Map(stories.map((item) => [item.id, item]));
  const chapterMap = new Map(chapters.map((item) => [item.id, item]));
  const commentMap = new Map(comments.map((item) => [item.id, item]));

  const nowMs = Date.now();
  const queueWithTarget = queueRows.map((item) => {
    const lastReportedMs = new Date(item.lastReportedAt).getTime();
    const ageHours = Math.floor((nowMs - lastReportedMs) / (60 * 60 * 1000));
    const isOverdue =
      item.status === "pending" && ageHours >= REPORT_CASE_SLA_HOURS;

    if (item.targetType === "story") {
      const story = storyMap.get(item.targetId);
      return {
        ...item,
        age_hours: ageHours,
        is_sla_overdue: isOverdue,
        target: story
          ? {
              id: story.id,
              title: story.title,
              slug: story.slug,
            }
          : null,
      };
    }

    if (item.targetType === "chapter") {
      const chapter = chapterMap.get(item.targetId);
      return {
        ...item,
        age_hours: ageHours,
        is_sla_overdue: isOverdue,
        target: chapter
          ? {
              id: chapter.id,
              title: chapter.title,
              chapter_number: chapter.chapterNumber,
              story: chapter.story,
            }
          : null,
      };
    }

    const comment = commentMap.get(item.targetId);
    return {
      ...item,
      age_hours: ageHours,
      is_sla_overdue: isOverdue,
      target: comment
        ? {
            id: comment.id,
            content_preview: String(comment.content || "").slice(0, 160),
            chapter: comment.chapter,
          }
        : null,
    };
  });

  const priorityScore = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  queueWithTarget.sort((left, right) => {
    if (left.is_sla_overdue !== right.is_sla_overdue) {
      return left.is_sla_overdue ? -1 : 1;
    }
    if (left.appealStatus === "pending" && right.appealStatus !== "pending") return -1;
    if (right.appealStatus === "pending" && left.appealStatus !== "pending") return 1;
    if ((priorityScore[left.priority] || 0) !== (priorityScore[right.priority] || 0)) {
      return (priorityScore[right.priority] || 0) - (priorityScore[left.priority] || 0);
    }
    if ((right.riskScore || 0) !== (left.riskScore || 0)) {
      return (right.riskScore || 0) - (left.riskScore || 0);
    }
    return new Date(right.lastReportedAt).getTime() - new Date(left.lastReportedAt).getTime();
  });

  const result = queueWithTarget.slice(0, parsedLimit);
  setCachedValue(cacheKey, result);
  return result;
}

module.exports = {
  getAdminDashboardSummary,
  getAdminDashboardTrends,
  getAdminDashboardQueues,
};
