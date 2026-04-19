const prisma = require("../../config/prisma");
const notificationService = require("../notification/notification.service");
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
const STORY_CHAPTER_FEATURED_LIMIT = 4;
const STORY_CHAPTER_FEATURED_LOOKBACK_HOURS = 72;
const MAX_STORY_CHAPTER_COMMENT_CANDIDATES = 300;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getCommentLikeCount = (comment) =>
  typeof comment?.stats?.likeCount === "number" ? comment.stats.likeCount : 0;

const getCommentAgeHours = (createdAt) => {
  if (!(createdAt instanceof Date)) return 9999;
  return Math.max(0, (Date.now() - createdAt.getTime()) / 3600000);
};

const scoreStoryChapterComment = (comment) => {
  const likeCount = getCommentLikeCount(comment);
  const ageHours = getCommentAgeHours(comment.createdAt);
  const freshness = clamp(
    (STORY_CHAPTER_FEATURED_LOOKBACK_HOURS - ageHours) /
      STORY_CHAPTER_FEATURED_LOOKBACK_HOURS,
    0,
    1,
  );
  const contentLength = String(comment.content || "").trim().length;
  const qualityBoost = clamp(contentLength / 280, 0, 1);
  return likeCount * 3 + freshness * 2 + qualityBoost;
};

const rankStoryChapterComments = (comments) =>
  [...comments]
    .map((comment) => ({
      comment,
      score: scoreStoryChapterComment(comment),
      likeCount: getCommentLikeCount(comment),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
      const aTs =
        a.comment.createdAt instanceof Date ? a.comment.createdAt.getTime() : 0;
      const bTs =
        b.comment.createdAt instanceof Date ? b.comment.createdAt.getTime() : 0;
      if (bTs !== aTs) return bTs - aTs;
      return String(a.comment.id).localeCompare(String(b.comment.id));
    });

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
  is_liked: false,
  author: story.author
    ? {
        id: story.author.id,
        display_name: story.author.displayName,
        avatar_url: story.author.avatarUrl,
      }
    : null,
});

const getStoryChapterEngagementSummary = async ({ storyId }) => {
  const chapters = await prisma.chapter.findMany({
    where: { storyId },
    select: {
      stats: {
        select: {
          likeCount: true,
          commentCount: true,
        },
      },
    },
  });

  return chapters.reduce(
    (acc, chapter) => {
      acc.like_count += chapter.stats?.likeCount ?? 0;
      acc.comment_count += chapter.stats?.commentCount ?? 0;
      return acc;
    },
    { like_count: 0, comment_count: 0 },
  );
};

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
});

const attachRatingsToStoryDtos = async (storyDtos) => {
  if (!Array.isArray(storyDtos) || storyDtos.length === 0) return [];

  const ratingRows = await prisma.storyRating.groupBy({
    by: ["storyId"],
    where: {
      storyId: { in: storyDtos.map((story) => story.id) },
    },
    _avg: { score: true },
    _count: { storyId: true },
  });

  const ratingMap = new Map(
    ratingRows.map((row) => [
      row.storyId,
      {
        rating: Number((row._avg.score ?? 0).toFixed(2)),
        rating_count: row._count.storyId ?? 0,
      },
    ]),
  );

  return storyDtos.map((story) => {
    const summary = ratingMap.get(story.id);
    return {
      ...story,
      rating: summary?.rating ?? 0,
      rating_count: summary?.rating_count ?? 0,
    };
  });
};
const SEARCH_SORTS = new Set(["updated", "newest", "title"]);

const parseNonNegativeInt = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`${fieldName} phải là số nguyên không âm`);
  }
  return num;
};

const parseSearchLimit = (value) => {
  if (value === undefined || value === null || value === "") return 20;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error("limit phải là số nguyên dương");
  }
  return Math.min(num, 50);
};

const parseRecommendationLimit = (value) => {
  if (value === undefined || value === null || value === "") return 10;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error("limit phải là số nguyên dương");
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
    throw new Error("sort không hợp lệ");
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
    throw new Error("genre_ids phải là mảng id hợp lệ");
  }
};

const buildStoryGenreCreateData = async (genreIds) => {
  if (!genreIds?.length) return [];

  const genres = await prisma.genre.findMany({
    where: { id: { in: genreIds }, isActive: true },
    select: { id: true },
  });

  if (genres.length !== genreIds.length) {
    throw new Error("Có thể loại không tồn tại hoặc đã bị ẩn");
  }

  return genreIds.map((genreId) => ({ genreId }));
};

const ensureStoryOwnerOrAdmin = ({ story, requester }) => {
  const isOwner = story.authorId === requester.id;
  const isAdmin = requester.role === "admin";
  if (!isOwner && !isAdmin) {
    throw new Error("Bạn không có quyền thao tác truyện này");
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
  if (!normalizedTitle) throw new Error("Tiêu đề truyện không được để trống");
  if (normalizedTitle.length > 200) throw new Error("Tiêu đề truyện tối đa 200 ký tự");

  const normalizedDescription = normalizeText(description);
  if (normalizedDescription.length > 5000) {
    throw new Error("Mô tả truyện tối đa 5000 ký tự");
  }

  const normalizedStatus = normalizeText(status) || "draft";
  if (!ALLOWED_STORY_STATUSES.has(normalizedStatus)) {
    throw new Error("Trạng thái truyện không hợp lệ");
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
      throw new Error("Trạng thái truyện không hợp lệ");
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

  return attachRatingsToStoryDtos(stories.map(formatStory));
};

const getMyStoryStats = async ({ userId }) => {
  const stories = await prisma.story.findMany({
    where: { authorId: userId },
    include: {
      stats: {
        select: {
          readCount: true,
          likeCount: true,
          commentCount: true,
        },
      },
      _count: {
        select: { chapters: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  const storyIds = stories.map((story) => story.id);
  const ratingRows = storyIds.length
    ? await prisma.storyRating.groupBy({
        by: ["storyId"],
        where: { storyId: { in: storyIds } },
        _avg: { score: true },
        _count: { storyId: true },
      })
    : [];

  const ratingMap = new Map(
    ratingRows.map((row) => [
      row.storyId,
      {
        rating: Number((row._avg.score ?? 0).toFixed(2)),
        rating_count: row._count.storyId ?? 0,
      },
    ]),
  );

  const enrichedStories = stories.map((story) => {
    const rating = ratingMap.get(story.id);
    return {
      id: story.id,
      title: story.title,
      slug: story.slug,
      status: story.status,
      updated_at: story.updatedAt,
      chapter_count: story._count?.chapters ?? 0,
      read_count: story.stats?.readCount ?? 0,
      like_count: story.stats?.likeCount ?? 0,
      comment_count: story.stats?.commentCount ?? 0,
      rating: rating?.rating ?? 0,
      rating_count: rating?.rating_count ?? 0,
    };
  });

  const totals = enrichedStories.reduce(
    (acc, story) => {
      acc.total_reads += story.read_count;
      acc.total_likes += story.like_count;
      acc.total_comments += story.comment_count;
      acc.total_ratings += story.rating_count;
      acc.total_weighted_rating += story.rating * story.rating_count;
      return acc;
    },
    {
      total_reads: 0,
      total_likes: 0,
      total_comments: 0,
      total_ratings: 0,
      total_weighted_rating: 0,
    },
  );

  const avgRating = totals.total_ratings
    ? Number((totals.total_weighted_rating / totals.total_ratings).toFixed(2))
    : 0;

  const topStories = [...enrichedStories]
    .sort((a, b) => b.read_count - a.read_count)
    .slice(0, 10);

  return {
    summary: {
      total_stories: enrichedStories.length,
      published_stories: enrichedStories.filter((story) => story.status === "published")
        .length,
      total_reads: totals.total_reads,
      total_likes: totals.total_likes,
      total_comments: totals.total_comments,
      total_ratings: totals.total_ratings,
      avg_rating: avgRating,
    },
    top_stories: topStories,
  };
};

const getMyAuthorDashboard = async ({ userId }) => {
  const stories = await prisma.story.findMany({
    where: { authorId: userId },
    include: {
      stats: {
        select: {
          readCount: true,
          likeCount: true,
          commentCount: true,
        },
      },
      _count: {
        select: { chapters: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  const storyIds = stories.map((story) => story.id);
  const ratingRows = storyIds.length
    ? await prisma.storyRating.groupBy({
        by: ["storyId"],
        where: { storyId: { in: storyIds } },
        _avg: { score: true },
        _count: { storyId: true },
      })
    : [];

  const ratingMap = new Map(
    ratingRows.map((row) => [
      row.storyId,
      {
        rating: Number((row._avg.score ?? 0).toFixed(2)),
        rating_count: row._count.storyId ?? 0,
      },
    ]),
  );

  const normalizedStories = stories.map((story) => {
    const rating = ratingMap.get(story.id);
    return {
      id: story.id,
      title: story.title,
      slug: story.slug,
      status: story.status,
      updated_at: story.updatedAt,
      chapter_count: story._count?.chapters ?? 0,
      read_count: story.stats?.readCount ?? 0,
      like_count: story.stats?.likeCount ?? 0,
      comment_count: story.stats?.commentCount ?? 0,
      rating: rating?.rating ?? 0,
      rating_count: rating?.rating_count ?? 0,
    };
  });

  const totalStories = normalizedStories.length;
  const totalChapters = normalizedStories.reduce(
    (sum, story) => sum + story.chapter_count,
    0,
  );
  const publishedStories = normalizedStories.filter(
    (story) => story.status === "published",
  ).length;
  const draftStories = normalizedStories.filter(
    (story) => story.status === "draft",
  ).length;
  const archivedStories = normalizedStories.filter(
    (story) => story.status === "archived",
  ).length;
  const totalReads = normalizedStories.reduce((sum, story) => sum + story.read_count, 0);
  const totalLikes = normalizedStories.reduce((sum, story) => sum + story.like_count, 0);
  const totalComments = normalizedStories.reduce(
    (sum, story) => sum + story.comment_count,
    0,
  );
  const totalRatings = normalizedStories.reduce(
    (sum, story) => sum + story.rating_count,
    0,
  );
  const totalWeightedRatings = normalizedStories.reduce(
    (sum, story) => sum + story.rating * story.rating_count,
    0,
  );
  const avgRating = totalRatings
    ? Number((totalWeightedRatings / totalRatings).toFixed(2))
    : 0;

  const readStart = new Date();
  readStart.setHours(0, 0, 0, 0);
  readStart.setDate(readStart.getDate() - 6);

  const readRows = storyIds.length
    ? await prisma.storyReadSession.findMany({
        where: {
          countedAt: { gte: readStart },
          story: { authorId: userId },
        },
        select: { countedAt: true },
      })
    : [];

  const readsByDate = new Map();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(readStart);
    d.setDate(readStart.getDate() + i);
    readsByDate.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of readRows) {
    const key = row.countedAt.toISOString().slice(0, 10);
    if (!readsByDate.has(key)) continue;
    readsByDate.set(key, (readsByDate.get(key) || 0) + 1);
  }

  const readTrend7d = Array.from(readsByDate.entries()).map(([date, reads]) => ({
    date,
    reads,
  }));

  const topStories = [...normalizedStories]
    .sort((a, b) => b.read_count - a.read_count)
    .slice(0, 8);

  const topChaptersRaw = storyIds.length
    ? await prisma.chapter.findMany({
        where: {
          story: { authorId: userId },
        },
        include: {
          story: {
            select: { id: true, title: true, slug: true },
          },
          stats: {
            select: { likeCount: true, commentCount: true },
          },
        },
      })
    : [];

  const topChapters = topChaptersRaw
    .map((chapter) => ({
      id: chapter.id,
      chapter_number: chapter.chapterNumber,
      title: chapter.title,
      status: chapter.status,
      updated_at: chapter.updatedAt,
      story: {
        id: chapter.story.id,
        title: chapter.story.title,
        slug: chapter.story.slug,
      },
      like_count: chapter.stats?.likeCount ?? 0,
      comment_count: chapter.stats?.commentCount ?? 0,
      engagement_score:
        (chapter.stats?.likeCount ?? 0) * 1 + (chapter.stats?.commentCount ?? 0) * 2,
    }))
    .sort((a, b) => b.engagement_score - a.engagement_score)
    .slice(0, 8);

  const needsAttention = [];
  for (const story of normalizedStories) {
    if (story.status === "published" && story.chapter_count === 0) {
      needsAttention.push({
        story_id: story.id,
        title: story.title,
        slug: story.slug,
        reason: "Truyện đang phát hành nhưng chưa có chương nào.",
      });
      continue;
    }
    if (story.status === "published" && story.read_count === 0) {
      needsAttention.push({
        story_id: story.id,
        title: story.title,
        slug: story.slug,
        reason: "Truyện đã phát hành nhưng chưa có lượt đọc.",
      });
      continue;
    }
    if (story.status === "published" && story.rating_count > 0 && story.rating < 3) {
      needsAttention.push({
        story_id: story.id,
        title: story.title,
        slug: story.slug,
        reason: "Điểm đánh giá trung bình thấp hơn 3.0.",
      });
    }
  }

  return {
    summary: {
      total_stories: totalStories,
      published_stories: publishedStories,
      draft_stories: draftStories,
      archived_stories: archivedStories,
      total_chapters: totalChapters,
      total_reads: totalReads,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_ratings: totalRatings,
      avg_rating: avgRating,
    },
    read_trend_7d: readTrend7d,
    top_stories: topStories,
    top_chapters: topChapters,
    needs_attention: needsAttention.slice(0, 8),
  };
};

const getAdminStories = async ({ status, query }) => {
  const normalizedQuery = normalizeText(query);
  const where = {};

  if (status !== undefined && status !== null && status !== "") {
    const normalizedStatus = normalizeText(status);
    if (!ALLOWED_STORY_STATUSES.has(normalizedStatus)) {
      throw new Error("Trạng thái truyện không hợp lệ");
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

  const mappedStories = stories.map((story) => ({
    ...formatStory(story),
    author: story.author
      ? {
          id: story.author.id,
          display_name: story.author.displayName,
          email: story.author.email,
        }
      : null,
  }));

  return attachRatingsToStoryDtos(mappedStories);
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
  if (!normalizedStoryId) throw new Error("Thiếu id truyện");

  const story = await prisma.story.findUnique({
    where: { id: normalizedStoryId },
    select: { id: true },
  });

  if (!story) throw new Error("Không tìm thấy truyện");
  return story;
};

const ensureStoryCanBeLiked = async ({ storyId, requester }) => {
  const normalizedStoryId = normalizeText(storyId);
  if (!normalizedStoryId) throw new Error("Thiếu id truyện");

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

  if (!story) throw new Error("Không tìm thấy truyện");

  const isOwner = requester?.id && story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  if (story.status !== "published" && !isOwner && !isAdmin) {
    throw new Error("Truyện chưa được xuất bản");
  }

  return story;
};

const ensureStoryCanBeCommented = async ({ storyId, requester }) => {
  const normalizedStoryId = normalizeText(storyId);
  if (!normalizedStoryId) throw new Error("Thiếu id truyện");

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

  if (!story) throw new Error("Không tìm thấy truyện");

  const isOwner = requester?.id && story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  if (story.status !== "published" && !isOwner && !isAdmin) {
    throw new Error("Truyện chưa được xuất bản");
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

const validateCommentContent = (content) => {
  const normalizedContent = normalizeText(content);
  if (!normalizedContent) throw new Error("Nội dung bình luận không được để trống");
  if (normalizedContent.length > 2000) {
    throw new Error("Nội dung bình luận tối đa 2000 ký tự");
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
    throw new Error("Thiếu định danh người đọc");
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
  if (!normalizedSlug) throw new Error("Thiếu slug truyện");

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
      storyGenres: {
        include: {
          genre: { select: { id: true, name: true, slug: true } },
        },
      },
      _count: { select: { chapters: true } },
    },
  });

  if (!story) throw new Error("Không tìm thấy truyện");

  const isOwner = requester?.id && story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  if (story.status !== "published" && !isOwner && !isAdmin) {
    throw new Error("Truyện chưa được xuất bản");
  }
  const ratingSummary = await getStoryRatingSummary({
    storyId: story.id,
    requester,
  });
  const engagementSummary = await getStoryChapterEngagementSummary({
    storyId: story.id,
  });

  return {
    ...formatStory(story),
    like_count: engagementSummary.like_count,
    rating: ratingSummary.rating,
    rating_count: ratingSummary.rating_count,
    my_rating: ratingSummary.my_rating,
    chapter_count: story._count.chapters,
    comment_count: engagementSummary.comment_count,
    is_liked: false,
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

const getStoryFeaturedComments = async ({ storyId, requester }) => {
  const story = await ensureStoryCanBeCommented({ storyId, requester });
  const comments = await prisma.chapterComment.findMany({
    where: {
      chapter: {
        storyId: story.id,
      },
    },
    take: MAX_STORY_CHAPTER_COMMENT_CANDIDATES,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      chapter: {
        select: {
          id: true,
          chapterNumber: true,
          title: true,
        },
      },
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

  const ranked = rankStoryChapterComments(comments).slice(
    0,
    STORY_CHAPTER_FEATURED_LIMIT,
  );
  const items = ranked.map(({ comment }) => ({
    id: comment.id,
    user_id: comment.userId,
    chapter_id: comment.chapterId,
    content: comment.content,
    like_count: getCommentLikeCount(comment),
    is_edited: comment.isEdited,
    created_at: comment.createdAt,
    updated_at: comment.updatedAt,
    is_mine: Boolean(requester?.id && comment.userId === requester.id),
    is_liked: Array.isArray(comment.likes) ? comment.likes.length > 0 : false,
    is_highlighted: true,
    user: {
      id: comment.user.id,
      display_name: comment.user.displayName,
      avatar_url: comment.user.avatarUrl,
      role: comment.user.role,
    },
    chapter: {
      id: comment.chapter.id,
      chapter_number: comment.chapter.chapterNumber,
      title: comment.chapter.title,
    },
  }));

  return {
    story: {
      id: story.id,
      title: story.title,
      slug: story.slug,
    },
    featured_comment_ids: items.map((item) => item.id),
    items,
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

  if (!fullBaseStory) throw new Error("Không tìm thấy truyện");

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

  const likedUsers = await prisma.chapterLike.findMany({
    where: {
      chapter: {
        storyId: baseStory.id,
      },
    },
    distinct: ["userId"],
    select: { userId: true },
    take: 500,
  });

  const userIds = likedUsers.map((item) => item.userId);
  if (!userIds.length) {
    return getSimilarStories({ storyId: baseStory.id, requester, limit: take });
  }

  const coLikeRows = await prisma.chapterLike.findMany({
    where: {
      userId: { in: userIds },
      chapter: {
        storyId: { not: baseStory.id },
        story: { status: "published" },
      },
    },
    select: {
      userId: true,
      chapter: {
        select: { storyId: true },
      },
    },
    take: 5000,
  });

  if (!coLikeRows.length) {
    return getSimilarStories({ storyId: baseStory.id, requester, limit: take });
  }

  const scoreByStoryId = new Map();
  const seenPairs = new Set();
  for (const row of coLikeRows) {
    const storyId = row.chapter?.storyId;
    if (!storyId) continue;
    const pairKey = `${row.userId}:${storyId}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    scoreByStoryId.set(storyId, (scoreByStoryId.get(storyId) || 0) + 1);
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
  if (!story) throw new Error("Không tìm thấy truyện");

  ensureStoryOwnerOrAdmin({ story, requester });

  const data = {};
  const parsedGenreIds = parseGenreIdsInput(genreIds);

  if (title !== undefined) {
    const normalizedTitle = normalizeText(title);
    if (!normalizedTitle) throw new Error("Tiêu đề truyện không được để trống");
    if (normalizedTitle.length > 200) throw new Error("Tiêu đề truyện tối đa 200 ký tự");
    data.title = normalizedTitle;
  }

  if (description !== undefined) {
    const normalizedDescription = normalizeText(description);
    if (normalizedDescription.length > 5000) {
      throw new Error("Mô tả truyện tối đa 5000 ký tự");
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
      throw new Error("Trạng thái truyện không hợp lệ");
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
      throw new Error("Không có dữ liệu hợp lệ để cập nhật");
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
  if (!story) throw new Error("Không tìm thấy truyện");

  ensureStoryOwnerOrAdmin({ story, requester });

  await prisma.story.delete({ where: { id: story.id } });
  if (story.coverUrl) {
    try {
      await deleteFileByPublicUrl(story.coverUrl);
    } catch (err) {
      console.error("Cleanup story cover on delete failed:", err.message);
    }
  }
  return { message: "Xóa truyện thành công" };
};

module.exports = {
  createStory,
  getMyStories,
  getMyStoryStats,
  getMyAuthorDashboard,
  getAdminStories,
  getPublishedStoriesByAuthor,
  searchStories,
  trackReadEvent,
  listStoryRatings,
  getMyStoryRating,
  upsertStoryRating,
  getStoryFeaturedComments,
  getSimilarStories,
  getRecommendedStories,
  getStoryDetailBySlug,
  updateStory,
  deleteStory,
};



