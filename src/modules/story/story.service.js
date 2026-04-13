const prisma = require("../../config/prisma");
const notificationService = require("../notification/notification.service");
const { emitStoryComment } = require("../../realtime/socket");
const {
  recomputeStoryFeaturedComments: recomputeStoryFeaturedRanking,
  getStoryFeaturedCommentIds,
} = require("../comment/comment-featured.service");
const {
  uploadStoryCoverAndGetUrl,
  deleteFileByPublicUrl,
} = require("../upload/upload.service");

const ALLOWED_STORY_STATUSES = new Set(["draft", "published", "archived"]);

const normalizeText = (value) => String(value ?? "").trim();
const getRequesterDisplayName = (requester) =>
  normalizeText(
    requester?.displayName ||
      requester?.display_name ||
      requester?.email ||
      "Ai do",
  );
const QUALIFIED_READ_SECONDS = 30;
const QUALIFIED_SCROLL_PERCENT = 50;
const QUALIFIED_CHAPTER_INDEX = 1;
const READ_COUNT_WINDOW_HOURS = 24;
const MIN_STORY_RATING = 1;
const MAX_STORY_RATING = 5;

const slugify = (value) => {
  const base = normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base || "story";
};

const ensureUniqueSlug = async ({ title, customSlug, excludeStoryId }) => {
  const raw = normalizeText(customSlug) || title;
  const baseSlug = slugify(raw);
  let candidate = baseSlug;
  let suffix = 1;

  while (true) {
    const existed = await prisma.story.findFirst({
      where: {
        slug: candidate,
        ...(excludeStoryId ? { id: { not: excludeStoryId } } : {}),
      },
      select: { id: true },
    });

    if (!existed) return candidate;
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
};

const formatStory = (story) => ({
  id: story.id,
  title: story.title,
  slug: story.slug,
  description: story.description,
  cover_url: story.coverUrl,
  read_count: typeof story.stats?.readCount === "number" ? story.stats.readCount : 0,
  like_count: typeof story.stats?.likeCount === "number" ? story.stats.likeCount : 0,
  status: story.status,
  author_id: story.authorId,
  created_at: story.createdAt,
  updated_at: story.updatedAt,
  genres: Array.isArray(story.storyGenres)
    ? story.storyGenres.map((item) => ({
        id: item.genre.id,
        name: item.genre.name,
        slug: item.genre.slug,
      }))
    : [],
});

const formatStoryCard = (story, requester) => ({
  ...formatStory(story),
  chapter_count: typeof story._count?.chapters === "number" ? story._count.chapters : 0,
  is_liked: Array.isArray(story.likes) ? story.likes.length > 0 : false,
  author: story.author
    ? {
        id: story.author.id,
        display_name: story.author.displayName,
        avatar_url: story.author.avatarUrl,
      }
    : null,
});

const recommendationStoryInclude = (requester) => ({
  stats: {
    select: { readCount: true, likeCount: true },
  },
  storyGenres: {
    include: {
      genre: { select: { id: true, name: true, slug: true } },
    },
  },
  author: {
    select: { id: true, displayName: true, avatarUrl: true },
  },
  _count: {
    select: { chapters: true },
  },
  likes: requester?.id
    ? {
        where: { userId: requester.id },
        select: { id: true },
        take: 1,
      }
    : false,
});
const SEARCH_SORTS = new Set(["updated", "newest", "title"]);

const parseNonNegativeInt = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`${fieldName} pháº£i lÃ  sá»‘ nguyÃªn khÃ´ng Ã¢m`);
  }
  return num;
};

const parseSearchLimit = (value) => {
  if (value === undefined || value === null || value === "") return 20;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error("limit pháº£i lÃ  sá»‘ nguyÃªn dÆ°Æ¡ng");
  }
  return Math.min(num, 50);
};

const parseRecommendationLimit = (value) => {
  if (value === undefined || value === null || value === "") return 10;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error("limit pháº£i lÃ  sá»‘ nguyÃªn dÆ°Æ¡ng");
  }
  return Math.min(num, 20);
};

const parseRatingScore = (value) => {
  const num = Number(value);
  if (!Number.isInteger(num)) {
    throw new Error("rating phải là số nguyên");
  }
  if (num < MIN_STORY_RATING || num > MAX_STORY_RATING) {
    throw new Error(`rating phải nằm trong khoảng ${MIN_STORY_RATING}-${MAX_STORY_RATING}`);
  }
  return num;
};

const parseRatingContent = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error("Nội dung đánh giá không được để trống");
  }
  if (normalized.length > 1000) {
    throw new Error("Nội dung đánh giá tối đa 1000 ký tự");
  }
  return normalized;
};

const buildSearchOrderBy = (sort) => {
  const normalizedSort = normalizeText(sort) || "updated";
  if (!SEARCH_SORTS.has(normalizedSort)) {
    throw new Error("sort khÃ´ng há»£p lá»‡");
  }

  switch (normalizedSort) {
    case "newest":
      return [{ createdAt: "desc" }, { updatedAt: "desc" }];
    case "title":
      return [{ title: "asc" }, { updatedAt: "desc" }];
    case "updated":
    default:
      return [{ updatedAt: "desc" }, { createdAt: "desc" }];
  }
};

const parseGenreIdsInput = (genreIds) => {
  if (genreIds === undefined || genreIds === null || genreIds === "") return null;

  if (Array.isArray(genreIds)) {
    return [...new Set(genreIds.map((item) => normalizeText(item)).filter(Boolean))];
  }

  const raw = normalizeText(genreIds);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error();
    return [...new Set(parsed.map((item) => normalizeText(item)).filter(Boolean))];
  } catch (_) {
    throw new Error("genre_ids pháº£i lÃ  máº£ng id há»£p lá»‡");
  }
};

const buildStoryGenreCreateData = async (genreIds) => {
  if (!genreIds?.length) return [];

  const genres = await prisma.genre.findMany({
    where: { id: { in: genreIds }, isActive: true },
    select: { id: true },
  });

  if (genres.length !== genreIds.length) {
    throw new Error("CÃ³ thá»ƒ loáº¡i khÃ´ng tá»“n táº¡i hoáº·c Ä‘Ã£ bá»‹ áº©n");
  }

  return genreIds.map((genreId) => ({ genreId }));
};

const ensureStoryOwnerOrAdmin = ({ story, requester }) => {
  const isOwner = story.authorId === requester.id;
  const isAdmin = requester.role === "admin";
  if (!isOwner && !isAdmin) {
    throw new Error("Báº¡n khÃ´ng cÃ³ quyá»n thao tÃ¡c truyá»‡n nÃ y");
  }
};

const createStory = async ({
  authorId,
  title,
  description,
  coverUrl,
  coverBase64,
  coverBuffer,
  coverMimeType,
  status,
  slug,
  genreIds,
}) => {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) throw new Error("TiÃªu Ä‘á» truyá»‡n khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng");
  if (normalizedTitle.length > 200) throw new Error("TiÃªu Ä‘á» truyá»‡n tá»‘i Ä‘a 200 kÃ½ tá»±");

  const normalizedDescription = normalizeText(description);
  if (normalizedDescription.length > 5000) {
    throw new Error("MÃ´ táº£ truyá»‡n tá»‘i Ä‘a 5000 kÃ½ tá»±");
  }

  const normalizedStatus = normalizeText(status) || "draft";
  if (!ALLOWED_STORY_STATUSES.has(normalizedStatus)) {
    throw new Error("Tráº¡ng thÃ¡i truyá»‡n khÃ´ng há»£p lá»‡");
  }

  const finalSlug = await ensureUniqueSlug({ title: normalizedTitle, customSlug: slug });
  const parsedGenreIds = parseGenreIdsInput(genreIds);
  let finalCoverUrl = normalizeText(coverUrl) || null;
  if (coverBase64 !== undefined || coverBuffer) {
    finalCoverUrl = await uploadStoryCoverAndGetUrl({
      ownerId: authorId,
      coverBase64,
      coverBuffer,
      coverMimeType,
    });
  }

  const story = await prisma.story.create({
    data: {
      title: normalizedTitle,
      slug: finalSlug,
      description: normalizedDescription || null,
      coverUrl: finalCoverUrl,
      status: normalizedStatus,
      authorId,
      ...(parsedGenreIds !== null
        ? {
            storyGenres: {
              create: await buildStoryGenreCreateData(parsedGenreIds),
            },
          }
        : {}),
    },
    include: {
      stats: {
        select: { readCount: true, likeCount: true },
      },
      storyGenres: {
        include: {
          genre: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  return formatStory(story);
};

const getMyStories = async ({ userId, status }) => {
  const where = { authorId: userId };

  if (status !== undefined && status !== null && status !== "") {
    const normalizedStatus = normalizeText(status);
    if (!ALLOWED_STORY_STATUSES.has(normalizedStatus)) {
      throw new Error("Tráº¡ng thÃ¡i truyá»‡n khÃ´ng há»£p lá»‡");
    }
    where.status = normalizedStatus;
  }

  const stories = await prisma.story.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      stats: {
        select: { readCount: true, likeCount: true },
      },
      storyGenres: {
        include: {
          genre: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  return stories.map(formatStory);
};

const getAdminStories = async ({ status, query }) => {
  const normalizedQuery = normalizeText(query);
  const where = {};

  if (status !== undefined && status !== null && status !== "") {
    const normalizedStatus = normalizeText(status);
    if (!ALLOWED_STORY_STATUSES.has(normalizedStatus)) {
      throw new Error("TrÃ¡ÂºÂ¡ng thÃƒÂ¡i truyÃ¡Â»â€¡n khÃƒÂ´ng hÃ¡Â»Â£p lÃ¡Â»â€¡");
    }
    where.status = normalizedStatus;
  }

  if (normalizedQuery) {
    where.OR = [
      { title: { contains: normalizedQuery, mode: "insensitive" } },
      { slug: { contains: normalizedQuery, mode: "insensitive" } },
      {
        author: {
          displayName: {
            contains: normalizedQuery,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  const stories = await prisma.story.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      stats: {
        select: { readCount: true, likeCount: true },
      },
      author: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      storyGenres: {
        include: {
          genre: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  return stories.map((story) => ({
    ...formatStory(story),
    author: story.author
      ? {
          id: story.author.id,
          display_name: story.author.displayName,
          email: story.author.email,
        }
      : null,
  }));
};

const getPublishedStoriesByAuthor = async ({ authorId, requester, limit }) => {
  const normalizedAuthorId = normalizeText(authorId);
  if (!normalizedAuthorId) throw new Error("Thieu id tac gia");

  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const user = await prisma.user.findUnique({
    where: { id: normalizedAuthorId },
    select: { id: true, role: true },
  });

  if (!user) throw new Error("Khong tim thay tac gia");
  if (user.role !== "author" && user.role !== "admin") {
    throw new Error("Nguoi dung nay khong co ho so tac gia cong khai");
  }

  const stories = await prisma.story.findMany({
    where: {
      authorId: normalizedAuthorId,
      status: "published",
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      stats: {
        select: { readCount: true, likeCount: true },
      },
      storyGenres: {
        include: {
          genre: { select: { id: true, name: true, slug: true } },
        },
      },
      author: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      _count: {
        select: { chapters: true },
      },
      likes: requester?.id
        ? {
            where: { userId: requester.id },
            select: { id: true },
            take: 1,
          }
        : false,
    },
  });

  const ratingRows = stories.length
    ? await prisma.storyRating.groupBy({
        by: ["storyId"],
        where: {
          storyId: { in: stories.map((story) => story.id) },
        },
        _avg: { score: true },
        _count: { storyId: true },
      })
    : [];

  const ratingMap = new Map(
    ratingRows.map((row) => [
      row.storyId,
      {
        rating: Number(row._avg.score ?? 0),
        rating_count: row._count.storyId ?? 0,
      },
    ]),
  );

  return stories.map((story) => {
    const summary = ratingMap.get(story.id);
    return {
      ...formatStoryCard(story, requester),
      rating: summary?.rating ?? 0,
      rating_count: summary?.rating_count ?? 0,
    };
  });
};

const ensureStoryExists = async (storyId) => {
  const normalizedStoryId = normalizeText(storyId);
  if (!normalizedStoryId) throw new Error("Thiáº¿u id truyá»‡n");

  const story = await prisma.story.findUnique({
    where: { id: normalizedStoryId },
    select: { id: true },
  });

  if (!story) throw new Error("KhÃ´ng tÃ¬m tháº¥y truyá»‡n");
  return story;
};

const ensureStoryCanBeLiked = async ({ storyId, requester }) => {
  const normalizedStoryId = normalizeText(storyId);
  if (!normalizedStoryId) throw new Error("ThiÃ¡ÂºÂ¿u id truyÃ¡Â»â€¡n");

  const story = await prisma.story.findUnique({
    where: { id: normalizedStoryId },
    select: {
      id: true,
      title: true,
      slug: true,
      authorId: true,
      status: true,
    },
  });

  if (!story) throw new Error("KhÃƒÂ´ng tÃƒÂ¬m thÃ¡ÂºÂ¥y truyÃ¡Â»â€¡n");

  const isOwner = requester?.id && story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  if (story.status !== "published" && !isOwner && !isAdmin) {
    throw new Error("TruyÃ¡Â»â€¡n chÃ†Â°a Ã„â€˜Ã†Â°Ã¡Â»Â£c xuÃ¡ÂºÂ¥t bÃ¡ÂºÂ£n");
  }

  return story;
};

const ensureStoryCanBeCommented = async ({ storyId, requester }) => {
  const normalizedStoryId = normalizeText(storyId);
  if (!normalizedStoryId) throw new Error("Thiáº¿u id truyá»‡n");

  const story = await prisma.story.findUnique({
    where: { id: normalizedStoryId },
    select: {
      id: true,
      title: true,
      slug: true,
      authorId: true,
      status: true,
    },
  });

  if (!story) throw new Error("KhÃ´ng tÃ¬m tháº¥y truyá»‡n");

  const isOwner = requester?.id && story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  if (story.status !== "published" && !isOwner && !isAdmin) {
    throw new Error("Truyá»‡n chÆ°a Ä‘Æ°á»£c xuáº¥t báº£n");
  }

  return story;
};

const getStoryRatingSummary = async ({ storyId, requester }) => {
  const [aggregate, myRatingRow] = await Promise.all([
    prisma.storyRating.aggregate({
      where: { storyId },
      _avg: { score: true },
      _count: { score: true },
    }),
    requester?.id
      ? prisma.storyRating.findUnique({
          where: {
            userId_storyId: {
              userId: requester.id,
              storyId,
            },
          },
          select: {
            score: true,
            content: true,
            editCount: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const rating = Number((aggregate._avg.score ?? 0).toFixed(2));
  const ratingCount = aggregate._count.score ?? 0;

  return {
    rating,
    rating_count: ratingCount,
    my_rating: myRatingRow
      ? {
          score: myRatingRow.score,
          content: myRatingRow.content,
          edit_count: myRatingRow.editCount,
          can_edit: myRatingRow.editCount < 1,
          created_at: myRatingRow.createdAt,
          updated_at: myRatingRow.updatedAt,
        }
      : null,
  };
};

const formatStoryRating = (row, requester) => ({
  id: row.id,
  story_id: row.storyId,
  user_id: row.userId,
  score: row.score,
  content: row.content,
  edit_count: row.editCount,
  can_edit: row.editCount < 1,
  created_at: row.createdAt,
  updated_at: row.updatedAt,
  is_mine: Boolean(requester?.id && requester.id === row.userId),
  user: row.user
    ? {
        id: row.user.id,
        display_name: row.user.displayName,
        avatar_url: row.user.avatarUrl,
        role: row.user.role,
      }
    : null,
});

const formatStoryComment = (comment, requester, featuredCommentIds = []) => ({
  id: comment.id,
  user_id: comment.userId,
  story_id: comment.storyId,
  content: comment.content,
  like_count:
    typeof comment.stats?.likeCount === "number" ? comment.stats.likeCount : 0,
  is_edited: comment.isEdited,
  created_at: comment.createdAt,
  updated_at: comment.updatedAt,
  is_mine: Boolean(requester?.id && comment.userId === requester.id),
  is_liked: Array.isArray(comment.likes) ? comment.likes.length > 0 : false,
  is_highlighted: featuredCommentIds.includes(comment.id),
  user: {
    id: comment.user.id,
    display_name: comment.user.displayName,
    avatar_url: comment.user.avatarUrl,
    role: comment.user.role,
  },
});

const validateCommentContent = (content) => {
  const normalizedContent = normalizeText(content);
  if (!normalizedContent) throw new Error("Ná»™i dung bÃ¬nh luáº­n khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng");
  if (normalizedContent.length > 2000) {
    throw new Error("Ná»™i dung bÃ¬nh luáº­n tá»‘i Ä‘a 2000 kÃ½ tá»±");
  }
  return normalizedContent;
};

const shouldQualifyRead = ({
  chapterIndex,
  timeSpentSeconds,
  maxScrollPercent,
}) =>
  chapterIndex >= QUALIFIED_CHAPTER_INDEX ||
  timeSpentSeconds >= QUALIFIED_READ_SECONDS ||
  maxScrollPercent >= QUALIFIED_SCROLL_PERCENT;

const searchStories = async ({ query, genreId, sort, limit }) => {
  const normalizedQuery = normalizeText(query);
  const normalizedGenreId = normalizeText(genreId);

  const stories = await prisma.story.findMany({
    where: {
      status: "published",
      ...(normalizedQuery
        ? {
            OR: [
              { title: { contains: normalizedQuery, mode: "insensitive" } },
              { description: { contains: normalizedQuery, mode: "insensitive" } },
              {
                author: {
                  displayName: {
                    contains: normalizedQuery,
                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : {}),
      ...(normalizedGenreId
        ? {
            storyGenres: {
              some: {
                genreId: normalizedGenreId,
              },
            },
          }
        : {}),
    },
    take: parseSearchLimit(limit),
    orderBy: buildSearchOrderBy(sort),
    include: {
      stats: {
        select: { readCount: true, likeCount: true },
      },
      author: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      storyGenres: {
        include: {
          genre: { select: { id: true, name: true, slug: true } },
        },
      },
      _count: {
        select: { chapters: true },
      },
    },
  });

  return stories.map((story) => ({
    ...formatStory(story),
    author: story.author
      ? {
          id: story.author.id,
          display_name: story.author.displayName,
          avatar_url: story.author.avatarUrl,
        }
      : null,
    chapter_count:
      typeof story._count?.chapters === "number" ? story._count.chapters : 0,
  }));
};

const trackReadEvent = async ({
  storyId,
  requester,
  deviceId,
  chapterIndex,
  timeSpentSeconds,
  maxScrollPercent,
}) => {
  const story = await ensureStoryExists(storyId);
  const normalizedDeviceId = normalizeText(deviceId);
  const normalizedChapterIndex = parseNonNegativeInt(chapterIndex, "chapter_index");
  const normalizedTimeSpentSeconds = parseNonNegativeInt(
    timeSpentSeconds,
    "time_spent_seconds",
  );
  const normalizedMaxScrollPercent = parseNonNegativeInt(
    maxScrollPercent,
    "max_scroll_percent",
  );

  if (!requester?.id && !normalizedDeviceId) {
    throw new Error("Thiáº¿u Ä‘á»‹nh danh ngÆ°á»i Ä‘á»c");
  }

  const qualified = shouldQualifyRead({
    chapterIndex: normalizedChapterIndex,
    timeSpentSeconds: normalizedTimeSpentSeconds,
    maxScrollPercent: normalizedMaxScrollPercent,
  });

  if (!qualified) {
    return {
      counted: false,
      qualified: false,
      read_count_incremented: false,
    };
  }

  const countedAfter = new Date(Date.now() - READ_COUNT_WINDOW_HOURS * 60 * 60 * 1000);

  const existingSession = await prisma.storyReadSession.findFirst({
    where: {
      storyId: story.id,
      countedAt: { gte: countedAfter },
      OR: [
        ...(requester?.id ? [{ userId: requester.id }] : []),
        ...(normalizedDeviceId ? [{ deviceId: normalizedDeviceId }] : []),
      ],
    },
    select: { id: true },
  });

  if (existingSession) {
    return {
      counted: false,
      qualified: true,
      read_count_incremented: false,
    };
  }

  const updatedStats = await prisma.$transaction(async (tx) => {
    await tx.storyReadSession.create({
      data: {
        storyId: story.id,
        userId: requester?.id || null,
        deviceId: normalizedDeviceId || null,
        chapterIndex: normalizedChapterIndex,
        timeSpentSeconds: normalizedTimeSpentSeconds,
        maxScrollPercent: normalizedMaxScrollPercent,
      },
    });

    return tx.storyStat.upsert({
      where: { storyId: story.id },
      create: {
        storyId: story.id,
        readCount: 1,
      },
      update: {
        readCount: { increment: 1 },
      },
      select: { readCount: true, likeCount: true },
    });
  });

  return {
    counted: true,
    qualified: true,
    read_count_incremented: true,
    read_count: updatedStats.readCount,
  };
};

const likeStory = async ({ storyId, requester }) => {
  const story = await ensureStoryCanBeLiked({ storyId, requester });

  const result = await prisma.$transaction(async (tx) => {
    const existed = await tx.storyLike.findUnique({
      where: {
        userId_storyId: {
          userId: requester.id,
          storyId: story.id,
        },
      },
      select: { id: true },
    });

    if (existed) {
      const stats = await tx.storyStat.upsert({
        where: { storyId: story.id },
        create: {
          storyId: story.id,
          readCount: 0,
          likeCount: 1,
        },
        update: {},
        select: { likeCount: true },
      });

      return {
        liked: true,
        like_count: stats.likeCount,
        should_notify: false,
      };
    }

    await tx.storyLike.create({
      data: {
        userId: requester.id,
        storyId: story.id,
      },
    });

    const stats = await tx.storyStat.upsert({
      where: { storyId: story.id },
      create: {
        storyId: story.id,
        readCount: 0,
        likeCount: 1,
      },
      update: {
        likeCount: { increment: 1 },
      },
      select: { likeCount: true },
    });

    return {
      liked: true,
      like_count: stats.likeCount,
      should_notify: true,
    };
  });

  if (result.should_notify && requester.id !== story.authorId) {
    await notificationService.createNotification({
      recipientId: story.authorId,
      actorId: requester.id,
      storyId: story.id,
      type: "story_liked",
      title: `${getRequesterDisplayName(requester)} Ä‘Ã£ thÃ­ch truyá»‡n cá»§a báº¡n`,
      body: story.title,
      linkUrl: `/stories/${story.slug}`,
      meta: {
        story_title: story.title,
      },
    });
  }

  return {
    liked: result.liked,
    like_count: result.like_count,
  };
};

const unlikeStory = async ({ storyId, requester }) => {
  const story = await ensureStoryCanBeLiked({ storyId, requester });

  return prisma.$transaction(async (tx) => {
    const existed = await tx.storyLike.findUnique({
      where: {
        userId_storyId: {
          userId: requester.id,
          storyId: story.id,
        },
      },
      select: { id: true },
    });

    if (!existed) {
      const stats = await tx.storyStat.findUnique({
        where: { storyId: story.id },
        select: { likeCount: true },
      });

      return {
        liked: false,
        like_count: stats?.likeCount ?? 0,
      };
    }

    await tx.storyLike.delete({
      where: {
        userId_storyId: {
          userId: requester.id,
          storyId: story.id,
        },
      },
    });

    const currentStats = await tx.storyStat.findUnique({
      where: { storyId: story.id },
      select: { likeCount: true },
    });

    if (!currentStats) {
      return {
        liked: false,
        like_count: 0,
      };
    }

    const updatedStats = await tx.storyStat.update({
      where: { storyId: story.id },
      data: { likeCount: Math.max(0, currentStats.likeCount - 1) },
      select: { likeCount: true },
    });

    return {
      liked: false,
      like_count: updatedStats.likeCount,
    };
  });
};

const getMyStoryRating = async ({ storyId, requester }) => {
  if (!requester?.id) throw new Error("Chưa đăng nhập");
  const story = await ensureStoryCanBeLiked({ storyId, requester });
  const summary = await getStoryRatingSummary({ storyId: story.id, requester });
  return {
    story_id: story.id,
    rating: summary.rating,
    rating_count: summary.rating_count,
    my_rating: summary.my_rating,
  };
};

const listStoryRatings = async ({ storyId, requester, limit }) => {
  const story = await ensureStoryCanBeCommented({ storyId, requester });
  let take = Number(limit);
  if (!Number.isInteger(take) || take <= 0) take = 20;
  take = Math.min(take, 100);

  const [summary, rows] = await Promise.all([
    getStoryRatingSummary({ storyId: story.id, requester }),
    prisma.storyRating.findMany({
      where: { storyId: story.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take,
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    }),
  ]);

  return {
    story: {
      id: story.id,
      title: story.title,
      slug: story.slug,
    },
    rating: summary.rating,
    rating_count: summary.rating_count,
    my_rating: summary.my_rating,
    items: rows.map((row) => formatStoryRating(row, requester)),
  };
};

const upsertStoryRating = async ({ storyId, requester, score, content }) => {
  if (!requester?.id) throw new Error("Chưa đăng nhập");
  const story = await ensureStoryCanBeLiked({ storyId, requester });
  const normalizedScore = parseRatingScore(score);
  const normalizedContent = parseRatingContent(content);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.storyRating.findUnique({
      where: {
        userId_storyId: {
          userId: requester.id,
          storyId: story.id,
        },
      },
      select: {
        id: true,
        score: true,
        content: true,
        editCount: true,
      },
    });

    if (!existing) {
      const created = await tx.storyRating.create({
        data: {
          userId: requester.id,
          storyId: story.id,
          score: normalizedScore,
          content: normalizedContent,
        },
        select: {
          score: true,
          content: true,
          editCount: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        created: true,
        edited: false,
        my_rating: {
          score: created.score,
          content: created.content,
          edit_count: created.editCount,
          can_edit: true,
          created_at: created.createdAt,
          updated_at: created.updatedAt,
        },
      };
    }

    if (existing.score === normalizedScore && existing.content === normalizedContent) {
      const current = await tx.storyRating.findUnique({
        where: {
          userId_storyId: {
            userId: requester.id,
            storyId: story.id,
          },
        },
        select: {
          score: true,
          content: true,
          editCount: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        created: false,
        edited: false,
        my_rating: current
          ? {
              score: current.score,
              content: current.content,
              edit_count: current.editCount,
              can_edit: current.editCount < 1,
              created_at: current.createdAt,
              updated_at: current.updatedAt,
            }
          : null,
      };
    }

    if (existing.editCount >= 1) {
      throw new Error("Bạn chỉ có thể sửa đánh giá một lần");
    }

    const updated = await tx.storyRating.update({
      where: {
        userId_storyId: {
          userId: requester.id,
          storyId: story.id,
        },
      },
      data: {
        score: normalizedScore,
        content: normalizedContent,
      },
      select: {
        score: true,
        content: true,
        editCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      created: false,
      edited: true,
      my_rating: {
        score: updated.score,
        content: updated.content,
        edit_count: updated.editCount,
        can_edit: updated.editCount < 1,
        created_at: updated.createdAt,
        updated_at: updated.updatedAt,
      },
    };
  });

  if (result.created && requester.id !== story.authorId) {
    await notificationService.createNotification({
      recipientId: story.authorId,
      actorId: requester.id,
      storyId: story.id,
      type: "system",
      title: `${getRequesterDisplayName(requester)} đã đánh giá truyện ${story.title}`,
      body: `${normalizedScore}/5 sao`,
      linkUrl: `/stories/${story.slug}`,
      meta: {
        story_title: story.title,
        rating_score: normalizedScore,
      },
    });
  }

  const summary = await getStoryRatingSummary({ storyId: story.id, requester });
  return {
    story_id: story.id,
    created: result.created,
    edited: result.edited,
    rating: summary.rating,
    rating_count: summary.rating_count,
    my_rating: result.my_rating,
  };
};

const getStoryDetailBySlug = async ({ slug, requester }) => {
  const normalizedSlug = normalizeText(slug);
  if (!normalizedSlug) throw new Error("Thiáº¿u slug truyá»‡n");

  const story = await prisma.story.findUnique({
    where: { slug: normalizedSlug },
    include: {
      stats: {
        select: { readCount: true, likeCount: true },
      },
      author: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          role: true,
          bio: true,
        },
      },
      likes: requester?.id
        ? {
            where: { userId: requester.id },
            select: { id: true },
            take: 1,
          }
        : false,
      storyGenres: {
        include: {
          genre: { select: { id: true, name: true, slug: true } },
        },
      },
      _count: { select: { chapters: true } },
    },
  });

  if (!story) throw new Error("KhÃ´ng tÃ¬m tháº¥y truyá»‡n");

  const isOwner = requester?.id && story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  if (story.status !== "published" && !isOwner && !isAdmin) {
    throw new Error("Truyá»‡n chÆ°a Ä‘Æ°á»£c xuáº¥t báº£n");
  }
  const ratingSummary = await getStoryRatingSummary({
    storyId: story.id,
    requester,
  });

  return {
    ...formatStory(story),
    rating: ratingSummary.rating,
    rating_count: ratingSummary.rating_count,
    my_rating: ratingSummary.my_rating,
    chapter_count: story._count.chapters,
    comment_count:
      typeof story.stats?.commentCount === "number" ? story.stats.commentCount : 0,
    is_liked: Array.isArray(story.likes) ? story.likes.length > 0 : false,
    author: {
      id: story.author.id,
      display_name: story.author.displayName,
      avatar_url: story.author.avatarUrl,
      role: story.author.role,
      bio: story.author.bio || "",
      story_count: await prisma.story.count({
        where: {
          authorId: story.authorId,
        },
      }),
    },
  };
};

const listStoryComments = async ({ storyId, requester, sort, limit }) => {
  const story = await ensureStoryCanBeCommented({ storyId, requester });
  const normalizedSort = normalizeText(sort).toLowerCase();

  let take = Number(limit);
  if (!Number.isInteger(take) || take <= 0) take = 20;
  take = Math.min(take, 100);

  const orderBy =
    normalizedSort === "oldest"
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];

  const comments = await prisma.storyComment.findMany({
    where: { storyId: story.id },
    orderBy,
    take,
    include: {
      stats: {
        select: { likeCount: true },
      },
      likes: requester?.id
        ? {
            where: { userId: requester.id },
            select: { id: true },
            take: 1,
          }
        : false,
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          role: true,
        },
      },
    },
  });

  const commentCount = await prisma.storyStat.findUnique({
    where: { storyId: story.id },
    select: { commentCount: true },
  });
  const featuredCommentIds = await getStoryFeaturedCommentIds({ storyId: story.id });

  return {
    story: {
      id: story.id,
      title: story.title,
      slug: story.slug,
    },
    total: commentCount?.commentCount ?? comments.length,
    featured_comment_ids: featuredCommentIds,
    items: comments.map((comment) =>
      formatStoryComment(comment, requester, featuredCommentIds),
    ),
  };
};

const ensureStoryCommentCanBeLiked = async ({ commentId, requester }) => {
  const normalizedCommentId = normalizeText(commentId);
  if (!normalizedCommentId) throw new Error("Thiáº¿u id bÃ¬nh luáº­n");

  const comment = await prisma.storyComment.findUnique({
    where: { id: normalizedCommentId },
    include: {
      story: {
        select: {
          id: true,
          title: true,
          slug: true,
          authorId: true,
          status: true,
        },
      },
    },
  });

  if (!comment) throw new Error("KhÃ´ng tÃ¬m tháº¥y bÃ¬nh luáº­n");

  const isOwner = requester?.id && comment.story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  if (comment.story.status !== "published" && !isOwner && !isAdmin) {
    throw new Error("Truyá»‡n chÆ°a Ä‘Æ°á»£c xuáº¥t báº£n");
  }

  return comment;
};

const ensureStoryCommentCanBeManaged = async ({ commentId, requester }) => {
  if (!requester?.id) throw new Error("Chua dang nhap");

  const normalizedCommentId = normalizeText(commentId);
  if (!normalizedCommentId) throw new Error("Thieu id binh luan");

  const comment = await prisma.storyComment.findUnique({
    where: { id: normalizedCommentId },
    include: {
      story: {
        select: {
          id: true,
          title: true,
          slug: true,
          authorId: true,
        },
      },
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          role: true,
        },
      },
      stats: {
        select: { likeCount: true },
      },
      likes: {
        where: { userId: requester.id },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!comment) throw new Error("Khong tim thay binh luan");

  const isCommentOwner = comment.userId === requester.id;
  const isStoryOwner = comment.story.authorId === requester.id;
  const isAdmin = requester.role === "admin";
  if (!isCommentOwner && !isStoryOwner && !isAdmin) {
    throw new Error("Ban khong co quyen thao tac binh luan nay");
  }

  return comment;
};

const createStoryComment = async ({ storyId, requester, content }) => {
  if (!requester?.id) throw new Error("ChÆ°a Ä‘Äƒng nháº­p");

  const story = await ensureStoryCanBeCommented({ storyId, requester });
  const normalizedContent = validateCommentContent(content);

  const createdComment = await prisma.$transaction(async (tx) => {
    const comment = await tx.storyComment.create({
      data: {
        userId: requester.id,
        storyId: story.id,
        content: normalizedContent,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    await tx.storyStat.upsert({
      where: { storyId: story.id },
      create: {
        storyId: story.id,
        readCount: 0,
        likeCount: 0,
        commentCount: 1,
      },
      update: {
        commentCount: { increment: 1 },
      },
    });
    await recomputeStoryFeaturedRanking({ tx, storyId: story.id });

    return comment;
  });

  const payload = formatStoryComment(createdComment, requester);
  emitStoryComment(story.id, payload);

  if (requester.id !== story.authorId) {
    await notificationService.createNotification({
      recipientId: story.authorId,
      actorId: requester.id,
      storyId: story.id,
      type: "story_commented",
      title: `${getRequesterDisplayName(requester)} Ä‘Ã£ bÃ¬nh luáº­n vá» truyá»‡n cá»§a báº¡n`,
      body: normalizedContent,
      linkUrl: `/stories/${story.slug}`,
      meta: {
        story_title: story.title,
        comment_preview: normalizedContent.slice(0, 120),
      },
    });
  }

  return payload;
};

const likeStoryComment = async ({ commentId, requester }) => {
  const comment = await ensureStoryCommentCanBeLiked({ commentId, requester });

  const result = await prisma.$transaction(async (tx) => {
    const existed = await tx.storyCommentLike.findUnique({
      where: {
        userId_commentId: {
          userId: requester.id,
          commentId: comment.id,
        },
      },
      select: { id: true },
    });

    if (existed) {
      const stats = await tx.storyCommentStat.upsert({
        where: { commentId: comment.id },
        create: {
          commentId: comment.id,
          likeCount: 1,
        },
        update: {},
        select: { likeCount: true },
      });
      await recomputeStoryFeaturedRanking({ tx, storyId: comment.storyId });

      return {
        liked: true,
        like_count: stats.likeCount,
        should_notify: false,
      };
    }

    await tx.storyCommentLike.create({
      data: {
        userId: requester.id,
        commentId: comment.id,
      },
    });

    const stats = await tx.storyCommentStat.upsert({
      where: { commentId: comment.id },
      create: {
        commentId: comment.id,
        likeCount: 1,
      },
      update: {
        likeCount: { increment: 1 },
      },
      select: { likeCount: true },
    });
    await recomputeStoryFeaturedRanking({ tx, storyId: comment.storyId });

    return {
      liked: true,
      like_count: stats.likeCount,
      should_notify: requester.id !== comment.userId,
    };
  });

  if (result.should_notify) {
    await notificationService.createNotification({
      recipientId: comment.userId,
      actorId: requester.id,
      storyId: comment.storyId,
      type: "system",
      title: `${getRequesterDisplayName(requester)} da thich binh luan cua ban`,
      body: comment.content,
      linkUrl: `/stories/${comment.story.slug}`,
      meta: {
        story_title: comment.story.title,
        comment_id: comment.id,
        comment_preview: String(comment.content || "").slice(0, 120),
      },
    });
  }

  return {
    liked: result.liked,
    like_count: result.like_count,
  };
};

const unlikeStoryComment = async ({ commentId, requester }) => {
  const comment = await ensureStoryCommentCanBeLiked({ commentId, requester });

  return prisma.$transaction(async (tx) => {
    const existed = await tx.storyCommentLike.findUnique({
      where: {
        userId_commentId: {
          userId: requester.id,
          commentId: comment.id,
        },
      },
      select: { id: true },
    });

    if (!existed) {
      const stats = await tx.storyCommentStat.findUnique({
        where: { commentId: comment.id },
        select: { likeCount: true },
      });

      return {
        liked: false,
        like_count: stats?.likeCount ?? 0,
      };
    }

    await tx.storyCommentLike.delete({
      where: {
        userId_commentId: {
          userId: requester.id,
          commentId: comment.id,
        },
      },
    });

    const currentStats = await tx.storyCommentStat.findUnique({
      where: { commentId: comment.id },
      select: { likeCount: true },
    });

    if (!currentStats) {
      return {
        liked: false,
        like_count: 0,
      };
    }

    const updatedStats = await tx.storyCommentStat.update({
      where: { commentId: comment.id },
      data: { likeCount: Math.max(0, currentStats.likeCount - 1) },
      select: { likeCount: true },
    });
    await recomputeStoryFeaturedRanking({ tx, storyId: comment.storyId });

    return {
      liked: false,
      like_count: updatedStats.likeCount,
    };
  });
};

const updateStoryComment = async ({ commentId, requester, content }) => {
  const comment = await ensureStoryCommentCanBeManaged({ commentId, requester });
  const normalizedContent = validateCommentContent(content);

  const updatedComment = await prisma.$transaction(async (tx) => {
    const updated = await tx.storyComment.update({
      where: { id: comment.id },
      data: {
        content: normalizedContent,
        isEdited: true,
      },
      include: {
        stats: {
          select: { likeCount: true },
        },
        likes: {
          where: { userId: requester.id },
          select: { id: true },
          take: 1,
        },
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    await recomputeStoryFeaturedRanking({ tx, storyId: comment.storyId });
    return updated;
  });

  const featuredCommentIds = await getStoryFeaturedCommentIds({
    storyId: comment.storyId,
  });
  return formatStoryComment(updatedComment, requester, featuredCommentIds);
};

const deleteStoryComment = async ({ commentId, requester }) => {
  const comment = await ensureStoryCommentCanBeManaged({ commentId, requester });

  return prisma.$transaction(async (tx) => {
    await tx.storyComment.delete({
      where: { id: comment.id },
    });

    const currentStats = await tx.storyStat.findUnique({
      where: { storyId: comment.storyId },
      select: { commentCount: true },
    });

    let nextCommentCount = 0;
    if (currentStats) {
      nextCommentCount = Math.max(0, currentStats.commentCount - 1);
      await tx.storyStat.update({
        where: { storyId: comment.storyId },
        data: { commentCount: nextCommentCount },
      });
    }

    await recomputeStoryFeaturedRanking({ tx, storyId: comment.storyId });

    return {
      deleted: true,
      comment_id: comment.id,
      story_id: comment.storyId,
      comment_count: nextCommentCount,
    };
  });
};

const getStoryFeaturedComments = async ({ storyId, requester }) => {
  const story = await ensureStoryCanBeCommented({ storyId, requester });
  const featuredCommentIds = await getStoryFeaturedCommentIds({ storyId: story.id });

  if (!featuredCommentIds.length) {
    return {
      story: {
        id: story.id,
        title: story.title,
        slug: story.slug,
      },
      featured_comment_ids: [],
      items: [],
    };
  }

  const comments = await prisma.storyComment.findMany({
    where: {
      storyId: story.id,
      id: { in: featuredCommentIds },
    },
    include: {
      stats: {
        select: { likeCount: true },
      },
      likes: requester?.id
        ? {
            where: { userId: requester.id },
            select: { id: true },
            take: 1,
          }
        : false,
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          role: true,
        },
      },
    },
  });

  const commentsById = new Map(comments.map((item) => [item.id, item]));
  const items = featuredCommentIds
    .map((id) => commentsById.get(id))
    .filter(Boolean)
    .map((comment) => formatStoryComment(comment, requester, featuredCommentIds));

  return {
    story: {
      id: story.id,
      title: story.title,
      slug: story.slug,
    },
    featured_comment_ids: featuredCommentIds,
    items,
  };
};

const recomputeStoryFeaturedByStoryId = async ({ storyId, requester }) => {
  const normalizedStoryId = normalizeText(storyId);
  if (!normalizedStoryId) throw new Error("Thiáº¿u id truyá»‡n");

  const story = await prisma.story.findUnique({
    where: { id: normalizedStoryId },
    select: { id: true, title: true, slug: true, authorId: true },
  });
  if (!story) throw new Error("KhÃ´ng tÃ¬m tháº¥y truyá»‡n");
  ensureStoryOwnerOrAdmin({ story, requester });

  const featuredCommentIds = await prisma.$transaction((tx) =>
    recomputeStoryFeaturedRanking({ tx, storyId: story.id }),
  );

  return {
    story: {
      id: story.id,
      title: story.title,
      slug: story.slug,
    },
    featured_comment_ids: featuredCommentIds,
  };
};

const getSimilarStories = async ({ storyId, requester, limit }) => {
  const baseStory = await ensureStoryCanBeCommented({ storyId, requester });
  const take = parseRecommendationLimit(limit);

  const fullBaseStory = await prisma.story.findUnique({
    where: { id: baseStory.id },
    include: {
      storyGenres: { select: { genreId: true } },
    },
  });

  if (!fullBaseStory) throw new Error("KhÃ´ng tÃ¬m tháº¥y truyá»‡n");

  const genreIds = Array.isArray(fullBaseStory.storyGenres)
    ? fullBaseStory.storyGenres.map((item) => item.genreId)
    : [];

  const candidates = await prisma.story.findMany({
    where: {
      status: "published",
      id: { not: fullBaseStory.id },
      OR: [
        { authorId: fullBaseStory.authorId },
        genreIds.length
          ? {
              storyGenres: {
                some: {
                  genreId: { in: genreIds },
                },
              },
            }
          : undefined,
      ].filter(Boolean),
    },
    include: recommendationStoryInclude(requester),
    take: 120,
  });

  let ranked = candidates
    .map((story) => {
      const sharedGenres = story.storyGenres.filter((item) =>
        genreIds.includes(item.genre.id),
      ).length;
      const sameAuthor = story.authorId === fullBaseStory.authorId ? 1 : 0;
      const ageMs = Date.now() - new Date(story.updatedAt).getTime();
      const ageDays = Math.max(0, ageMs / (24 * 60 * 60 * 1000));
      const freshness = Math.max(0, 1 - ageDays / 30);
      const score = sharedGenres * 3 + sameAuthor + freshness;
      return { story, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.story.updatedAt).getTime() - new Date(a.story.updatedAt).getTime();
    })
    .slice(0, take)
    .map((item) => item.story);

  if (ranked.length < take) {
    const missing = take - ranked.length;
    const existedIds = new Set([fullBaseStory.id, ...ranked.map((item) => item.id)]);
    const fallback = await prisma.story.findMany({
      where: {
        status: "published",
        id: { notIn: Array.from(existedIds) },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: recommendationStoryInclude(requester),
      take: missing,
    });
    ranked = [...ranked, ...fallback];
  }

  return ranked.map((item) => formatStoryCard(item, requester));
};

const getRecommendedStories = async ({ storyId, requester, limit }) => {
  const baseStory = await ensureStoryCanBeCommented({ storyId, requester });
  const take = parseRecommendationLimit(limit);

  const likedUsers = await prisma.storyLike.findMany({
    where: { storyId: baseStory.id },
    select: { userId: true },
    take: 500,
  });

  const userIds = likedUsers.map((item) => item.userId);
  if (!userIds.length) {
    return getSimilarStories({ storyId: baseStory.id, requester, limit: take });
  }

  const coLikeRows = await prisma.storyLike.findMany({
    where: {
      userId: { in: userIds },
      storyId: { not: baseStory.id },
      story: { status: "published" },
    },
    select: { storyId: true },
    take: 5000,
  });

  if (!coLikeRows.length) {
    return getSimilarStories({ storyId: baseStory.id, requester, limit: take });
  }

  const scoreByStoryId = new Map();
  for (const row of coLikeRows) {
    scoreByStoryId.set(row.storyId, (scoreByStoryId.get(row.storyId) || 0) + 1);
  }

  const rankedStoryIds = Array.from(scoreByStoryId.entries())
    .sort((a, b) => b[1] - a[1])
    .map((item) => item[0]);

  const stories = await prisma.story.findMany({
    where: {
      id: { in: rankedStoryIds },
      status: "published",
    },
    include: recommendationStoryInclude(requester),
  });

  const storyMap = new Map(stories.map((item) => [item.id, item]));
  let ranked = rankedStoryIds
    .map((id) => storyMap.get(id))
    .filter(Boolean)
    .slice(0, take);

  if (ranked.length < take) {
    const missing = take - ranked.length;
    const existedIds = new Set([baseStory.id, ...ranked.map((item) => item.id)]);
    const fallback = await prisma.story.findMany({
      where: {
        status: "published",
        id: { notIn: Array.from(existedIds) },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: recommendationStoryInclude(requester),
      take: missing,
    });
    ranked = [...ranked, ...fallback];
  }

  return ranked.map((item) => formatStoryCard(item, requester));
};
const updateStory = async ({
  storyId,
  requester,
  title,
  description,
  coverUrl,
  coverBase64,
  coverBuffer,
  coverMimeType,
  status,
  slug,
  genreIds,
}) => {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      stats: {
        select: { readCount: true, likeCount: true },
      },
      storyGenres: {
        include: {
          genre: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  if (!story) throw new Error("KhÃ´ng tÃ¬m tháº¥y truyá»‡n");

  ensureStoryOwnerOrAdmin({ story, requester });

  const data = {};
  const parsedGenreIds = parseGenreIdsInput(genreIds);

  if (title !== undefined) {
    const normalizedTitle = normalizeText(title);
    if (!normalizedTitle) throw new Error("TiÃªu Ä‘á» truyá»‡n khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng");
    if (normalizedTitle.length > 200) throw new Error("TiÃªu Ä‘á» truyá»‡n tá»‘i Ä‘a 200 kÃ½ tá»±");
    data.title = normalizedTitle;
  }

  if (description !== undefined) {
    const normalizedDescription = normalizeText(description);
    if (normalizedDescription.length > 5000) {
      throw new Error("MÃ´ táº£ truyá»‡n tá»‘i Ä‘a 5000 kÃ½ tá»±");
    }
    data.description = normalizedDescription || null;
  }

  if (coverBase64 !== undefined || coverBuffer) {
    const uploadedCoverUrl = await uploadStoryCoverAndGetUrl({
      ownerId: story.authorId,
      coverBase64,
      coverBuffer,
      coverMimeType,
    });
    data.coverUrl = uploadedCoverUrl;
  } else if (coverUrl !== undefined) {
    data.coverUrl = normalizeText(coverUrl) || null;
  }

  if (status !== undefined) {
    const normalizedStatus = normalizeText(status);
    if (!ALLOWED_STORY_STATUSES.has(normalizedStatus)) {
      throw new Error("Tráº¡ng thÃ¡i truyá»‡n khÃ´ng há»£p lá»‡");
    }
    data.status = normalizedStatus;
  }

  if (slug !== undefined || (title !== undefined && !story.slug)) {
    data.slug = await ensureUniqueSlug({
      title: data.title || story.title,
      customSlug: slug,
      excludeStoryId: story.id,
    });
  }

  if (!Object.keys(data).length) {
    if (parsedGenreIds === null) {
      throw new Error("KhÃ´ng cÃ³ dá»¯ liá»‡u há»£p lá»‡ Ä‘á»ƒ cáº­p nháº­t");
    }
  }

  let storyGenresData = undefined;
  if (parsedGenreIds !== null) {
    storyGenresData = {
      deleteMany: {},
      create: await buildStoryGenreCreateData(parsedGenreIds),
    };
  }

  const updatedStory = await prisma.story.update({
    where: { id: story.id },
    data: {
      ...data,
      ...(storyGenresData ? { storyGenres: storyGenresData } : {}),
    },
    include: {
      stats: {
        select: { readCount: true, likeCount: true },
      },
      storyGenres: {
        include: {
          genre: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  if (
    data.coverUrl !== undefined &&
    story.coverUrl &&
    story.coverUrl !== updatedStory.coverUrl
  ) {
    try {
      await deleteFileByPublicUrl(story.coverUrl);
    } catch (err) {
      console.error("Cleanup old story cover failed:", err.message);
    }
  }

  return formatStory(updatedStory);
};

const deleteStory = async ({ storyId, requester }) => {
  const story = await prisma.story.findUnique({ where: { id: storyId } });
  if (!story) throw new Error("KhÃ´ng tÃ¬m tháº¥y truyá»‡n");

  ensureStoryOwnerOrAdmin({ story, requester });

  await prisma.story.delete({ where: { id: story.id } });
  if (story.coverUrl) {
    try {
      await deleteFileByPublicUrl(story.coverUrl);
    } catch (err) {
      console.error("Cleanup story cover on delete failed:", err.message);
    }
  }
  return { message: "XÃ³a truyá»‡n thÃ nh cÃ´ng" };
};

module.exports = {
  createStory,
  getMyStories,
  getAdminStories,
  getPublishedStoriesByAuthor,
  searchStories,
  trackReadEvent,
  likeStory,
  unlikeStory,
  listStoryRatings,
  getMyStoryRating,
  upsertStoryRating,
  listStoryComments,
  createStoryComment,
  likeStoryComment,
  unlikeStoryComment,
  updateStoryComment,
  deleteStoryComment,
  getStoryFeaturedComments,
  recomputeStoryFeaturedByStoryId,
  getSimilarStories,
  getRecommendedStories,
  getStoryDetailBySlug,
  updateStory,
  deleteStory,
};



