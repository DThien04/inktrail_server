const prisma = require("../../config/prisma");

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const DEFAULT_PAGE = 1;
const MAX_PAGE = 1000000;
const VN_UTC_OFFSET_MINUTES = 7 * 60;

const parseLimit = (value) => {
  if (value === undefined || value === null || value === "") return DEFAULT_LIMIT;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Giới hạn danh sách (limit) không hợp lệ.");
  }

  return Math.min(parsed, MAX_LIMIT);
};

const parsePage = (value) => {
  if (value === undefined || value === null || value === "") return DEFAULT_PAGE;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Số trang (page) không hợp lệ.");
  }

  return Math.min(parsed, MAX_PAGE);
};

const getCurrentMonthRangeForOffset = (offsetMinutes = VN_UTC_OFFSET_MINUTES) => {
  const nowUtc = new Date();
  const shiftedNow = new Date(nowUtc.getTime() + offsetMinutes * 60 * 1000);
  const localMonthStartShifted = new Date(
    shiftedNow.getUTCFullYear(),
    shiftedNow.getUTCMonth(),
    1,
  );
  const nextMonthStartShifted = new Date(
    shiftedNow.getUTCFullYear(),
    shiftedNow.getUTCMonth() + 1,
    1,
  );

  return {
    from: new Date(localMonthStartShifted.getTime() - offsetMinutes * 60 * 1000),
    to: new Date(nextMonthStartShifted.getTime() - offsetMinutes * 60 * 1000),
  };
};

const storySummaryInclude = {
  author: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  storyTags: {
    include: {
      tag: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  _count: {
    select: {
      chapters: true,
    },
  },
  stats: {
    select: {
      readCount: true,
      likeCount: true,
      commentCount: true,
    },
  },
};

const loadRatingStatsByStoryIds = async (storyIds) => {
  if (!Array.isArray(storyIds) || storyIds.length === 0) return new Map();

  const grouped = await prisma.storyRating.groupBy({
    by: ["storyId"],
    where: {
      storyId: { in: storyIds },
    },
    _avg: { score: true },
    _count: { _all: true },
  });

  const statsMap = new Map();
  for (const row of grouped) {
    const average = typeof row._avg?.score === "number" ? row._avg.score : 0;
    statsMap.set(row.storyId, {
      rating: Number(average.toFixed(2)),
      rating_count: row._count?._all ?? 0,
    });
  }
  return statsMap;
};

const formatStorySummary = (story, ratingStatsByStoryId = new Map()) => {
  const ratingStats = ratingStatsByStoryId.get(story.id) || {
    rating: 0,
    rating_count: 0,
  };

  return {
    id: story.id,
    title: story.title,
    slug: story.slug,
    description: story.description,
    cover_url: story.coverUrl,
    read_count: typeof story.stats?.readCount === "number" ? story.stats.readCount : 0,
    like_count: typeof story.stats?.likeCount === "number" ? story.stats.likeCount : 0,
    comment_count:
      typeof story.stats?.commentCount === "number" ? story.stats.commentCount : 0,
    rating: ratingStats.rating,
    rating_count: ratingStats.rating_count,
    status: story.status,
    created_at: story.createdAt,
    updated_at: story.updatedAt,
    author: story.author
      ? {
          id: story.author.id,
          display_name: story.author.displayName,
          avatar_url: story.author.avatarUrl,
        }
      : null,
    chapter_count:
      typeof story._count?.chapters === "number" ? story._count.chapters : 0,
    tags: Array.isArray(story.storyTags)
      ? story.storyTags.map((item) => ({
          id: item.tag.id,
          name: item.tag.name,
        }))
      : [],
  };
};

const getNewStories = async ({ limit, page }) => {
  const take = parseLimit(limit);
  const currentPage = parsePage(page);
  const skip = (currentPage - 1) * take;

  const stories = await prisma.story.findMany({
    where: { status: "published", isHidden: false },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    skip,
    take: take + 1,
    include: storySummaryInclude,
  });

  const hasMore = stories.length > take;
  const items = hasMore ? stories.slice(0, take) : stories;

  const ratingStatsByStoryId = await loadRatingStatsByStoryIds(
    items.map((story) => story.id),
  );

  return {
    items: items.map((story) => formatStorySummary(story, ratingStatsByStoryId)),
    pagination: {
      page: currentPage,
      limit: take,
      has_more: hasMore,
      next_page: hasMore ? currentPage + 1 : null,
    },
  };
};

const getHotStories = async ({ limit, page }) => {
  const take = parseLimit(limit);
  const currentPage = parsePage(page);

  const stories = await prisma.story.findMany({
    where: { status: "published", isHidden: false },
    take: MAX_LIMIT * 10,
    include: storySummaryInclude,
  });

  const ratingStatsByStoryId = await loadRatingStatsByStoryIds(
    stories.map((story) => story.id),
  );

  const ranked = stories
    .map((story) => {
      const readCount =
        typeof story.stats?.readCount === "number" ? story.stats.readCount : 0;
      const likeCount =
        typeof story.stats?.likeCount === "number" ? story.stats.likeCount : 0;
      const commentCount =
        typeof story.stats?.commentCount === "number" ? story.stats.commentCount : 0;
      const ratingStats = ratingStatsByStoryId.get(story.id) || {
        rating: 0,
        rating_count: 0,
      };
      const rating = ratingStats.rating;
      const ratingCount = ratingStats.rating_count;

      // Giữ nguyên tiêu chí hot cũ, chỉ bổ sung tín hiệu rating.
      const engagementScore = readCount * 5 + likeCount * 3 + commentCount * 2;
      const ratingSignal =
        ratingCount > 0 ? rating * Math.log10(ratingCount + 1) * 20 : 0;
      const hotScore = engagementScore + ratingSignal;
      return { story, hotScore };
    })
    .sort((a, b) => {
      if (b.hotScore !== a.hotScore) return b.hotScore - a.hotScore;
      const aUpdated = a.story.updatedAt instanceof Date ? a.story.updatedAt.getTime() : 0;
      const bUpdated = b.story.updatedAt instanceof Date ? b.story.updatedAt.getTime() : 0;
      if (bUpdated !== aUpdated) return bUpdated - aUpdated;
      const aCreated = a.story.createdAt instanceof Date ? a.story.createdAt.getTime() : 0;
      const bCreated = b.story.createdAt instanceof Date ? b.story.createdAt.getTime() : 0;
      return bCreated - aCreated;
    })
    .slice((currentPage - 1) * take, currentPage * take + 1)
    .map((item) => item.story);

  const hasMore = ranked.length > take;
  const items = hasMore ? ranked.slice(0, take) : ranked;

  return {
    items: items.map((story) => formatStorySummary(story, ratingStatsByStoryId)),
    pagination: {
      page: currentPage,
      limit: take,
      has_more: hasMore,
      next_page: hasMore ? currentPage + 1 : null,
    },
  };
};

const getMonthlyRankingStories = async ({ limit }) => {
  const take = parseLimit(limit);
  const { from, to } = getCurrentMonthRangeForOffset();

  const stories = await prisma.story.findMany({
    where: { status: "published", isHidden: false },
    take: MAX_LIMIT,
    include: storySummaryInclude,
  });

  if (stories.length === 0) return [];

  const storyIds = stories.map((story) => story.id);

  const [sessionGrouped, likeGrouped, commentGrouped, ratingGrouped] =
    await Promise.all([
      prisma.storyReadSession.groupBy({
        by: ["storyId"],
        where: {
          storyId: { in: storyIds },
          countedAt: { gte: from, lt: to },
        },
        _count: { _all: true },
      }),
      prisma.chapterLike.groupBy({
        by: ["chapterId"],
        where: {
          chapter: { storyId: { in: storyIds } },
          createdAt: { gte: from, lt: to },
        },
        _count: { _all: true },
      }),
      prisma.chapterComment.groupBy({
        by: ["chapterId"],
        where: {
          chapter: { storyId: { in: storyIds } },
          createdAt: { gte: from, lt: to },
          isHidden: false,
        },
        _count: { _all: true },
      }),
      prisma.storyRating.groupBy({
        by: ["storyId"],
        where: {
          storyId: { in: storyIds },
          createdAt: { gte: from, lt: to },
        },
        _avg: { score: true },
        _count: { _all: true },
      }),
    ]);

  const chapterToStoryId = new Map();
  const chapters = await prisma.chapter.findMany({
    where: { storyId: { in: storyIds } },
    select: { id: true, storyId: true },
  });
  for (const chapter of chapters) {
    chapterToStoryId.set(chapter.id, chapter.storyId);
  }

  const monthlyReadByStory = new Map();
  for (const row of sessionGrouped) {
    monthlyReadByStory.set(row.storyId, row._count?._all ?? 0);
  }

  const monthlyLikeByStory = new Map();
  for (const row of likeGrouped) {
    const storyId = chapterToStoryId.get(row.chapterId);
    if (!storyId) continue;
    monthlyLikeByStory.set(
      storyId,
      (monthlyLikeByStory.get(storyId) ?? 0) + (row._count?._all ?? 0),
    );
  }

  const monthlyCommentByStory = new Map();
  for (const row of commentGrouped) {
    const storyId = chapterToStoryId.get(row.chapterId);
    if (!storyId) continue;
    monthlyCommentByStory.set(
      storyId,
      (monthlyCommentByStory.get(storyId) ?? 0) + (row._count?._all ?? 0),
    );
  }

  const monthlyRatingByStory = new Map();
  for (const row of ratingGrouped) {
    monthlyRatingByStory.set(row.storyId, {
      rating: typeof row._avg?.score === "number" ? row._avg.score : 0,
      ratingCount: row._count?._all ?? 0,
    });
  }

  const ratingStatsByStoryId = await loadRatingStatsByStoryIds(storyIds);

  const ranked = stories
    .map((story) => {
      const monthlyRead = monthlyReadByStory.get(story.id) ?? 0;
      const monthlyLike = monthlyLikeByStory.get(story.id) ?? 0;
      const monthlyComment = monthlyCommentByStory.get(story.id) ?? 0;
      const monthlyRating = monthlyRatingByStory.get(story.id) ?? {
        rating: 0,
        ratingCount: 0,
      };

      const score =
        monthlyRead * 0.6 +
        monthlyLike * 1.8 +
        monthlyComment * 1.4 +
        monthlyRating.rating * Math.log10(monthlyRating.ratingCount + 1) * 10;

      return {
        story,
        score,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aUpdated = a.story.updatedAt instanceof Date ? a.story.updatedAt.getTime() : 0;
      const bUpdated = b.story.updatedAt instanceof Date ? b.story.updatedAt.getTime() : 0;
      if (bUpdated !== aUpdated) return bUpdated - aUpdated;
      const aCreated = a.story.createdAt instanceof Date ? a.story.createdAt.getTime() : 0;
      const bCreated = b.story.createdAt instanceof Date ? b.story.createdAt.getTime() : 0;
      return bCreated - aCreated;
    })
    .slice(0, take)
    .map((item) => item.story);

  return ranked.map((story) => formatStorySummary(story, ratingStatsByStoryId));
};

module.exports = {
  getNewStories,
  getHotStories,
  getMonthlyRankingStories,
};

