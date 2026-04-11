const prisma = require("../../config/prisma");

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

const parseLimit = (value) => {
  if (value === undefined || value === null || value === "") return DEFAULT_LIMIT;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("limit phải là số nguyên dương");
  }

  return Math.min(parsed, MAX_LIMIT);
};

const storySummaryInclude = {
  author: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  storyGenres: {
    include: {
      genre: {
        select: {
          id: true,
          name: true,
          slug: true,
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
    genres: Array.isArray(story.storyGenres)
      ? story.storyGenres.map((item) => ({
          id: item.genre.id,
          name: item.genre.name,
          slug: item.genre.slug,
        }))
      : [],
  };
};

const getNewStories = async ({ limit }) => {
  const stories = await prisma.story.findMany({
    where: { status: "published" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: parseLimit(limit),
    include: storySummaryInclude,
  });

  const ratingStatsByStoryId = await loadRatingStatsByStoryIds(
    stories.map((story) => story.id),
  );

  return stories.map((story) => formatStorySummary(story, ratingStatsByStoryId));
};

const getHotStories = async ({ limit }) => {
  const stories = await prisma.story.findMany({
    where: { status: "published" },
    take: MAX_LIMIT,
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
    .slice(0, parseLimit(limit))
    .map((item) => item.story);

  return ranked.map((story) => formatStorySummary(story, ratingStatsByStoryId));
};

module.exports = {
  getNewStories,
  getHotStories,
};
