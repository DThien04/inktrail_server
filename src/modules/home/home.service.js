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
};

const formatStorySummary = (story) => ({
  id: story.id,
  title: story.title,
  slug: story.slug,
  description: story.description,
  cover_url: story.coverUrl,
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
    orderBy: [
      { chapters: { _count: "desc" } },
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ],
    take: parseLimit(limit),
    include: storySummaryInclude,
  });

  return stories.map(formatStorySummary);
};

module.exports = {
  getNewStories,
  getHotStories,
};
