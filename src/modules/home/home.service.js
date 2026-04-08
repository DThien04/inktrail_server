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

const formatStorySummary = (story) => ({
  id: story.id,
  title: story.title,
  slug: story.slug,
  description: story.description,
  cover_url: story.coverUrl,
  read_count: typeof story.stats?.readCount === "number" ? story.stats.readCount : 0,
  like_count: typeof story.stats?.likeCount === "number" ? story.stats.likeCount : 0,
  comment_count:
    typeof story.stats?.commentCount === "number" ? story.stats.commentCount : 0,
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
});

const getNewStories = async ({ limit }) => {
  const stories = await prisma.story.findMany({
    where: { status: "published" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: parseLimit(limit),
    include: storySummaryInclude,
  });

  return stories.map(formatStorySummary);
};

const getHotStories = async ({ limit }) => {
  const stories = await prisma.story.findMany({
    where: { status: "published" },
    take: MAX_LIMIT,
    include: storySummaryInclude,
  });

  const ranked = stories
    .map((story) => {
      const readCount =
        typeof story.stats?.readCount === "number" ? story.stats.readCount : 0;
      const likeCount =
        typeof story.stats?.likeCount === "number" ? story.stats.likeCount : 0;
      const commentCount =
        typeof story.stats?.commentCount === "number" ? story.stats.commentCount : 0;

      // Hot ưu tiên tương tác thật, dùng updatedAt để phá hòa.
      const hotScore = readCount * 5 + likeCount * 3 + commentCount * 2;
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

  return ranked.map(formatStorySummary);
};

module.exports = {
  getNewStories,
  getHotStories,
};
