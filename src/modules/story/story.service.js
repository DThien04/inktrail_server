const prisma = require("../../config/prisma");
const {
  uploadStoryCoverAndGetUrl,
  deleteFileByPublicUrl,
} = require("../upload/upload.service");

const ALLOWED_STORY_STATUSES = new Set(["draft", "published", "archived"]);

const normalizeText = (value) => String(value ?? "").trim();
const QUALIFIED_READ_SECONDS = 30;
const QUALIFIED_SCROLL_PERCENT = 50;
const QUALIFIED_CHAPTER_INDEX = 1;
const READ_COUNT_WINDOW_HOURS = 24;

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
        select: { readCount: true },
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
        select: { readCount: true },
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
        select: { readCount: true },
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
      select: { readCount: true },
    });
  });

  return {
    counted: true,
    qualified: true,
    read_count_incremented: true,
    read_count: updatedStats.readCount,
  };
};

const getStoryDetailBySlug = async ({ slug, requester }) => {
  const normalizedSlug = normalizeText(slug);
  if (!normalizedSlug) throw new Error("Thiếu slug truyện");

  const story = await prisma.story.findUnique({
    where: { slug: normalizedSlug },
    include: {
      stats: {
        select: { readCount: true },
      },
      author: {
        select: { id: true, displayName: true, avatarUrl: true, role: true },
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

  return {
    ...formatStory(story),
    chapter_count: story._count.chapters,
    author: {
      id: story.author.id,
      display_name: story.author.displayName,
      avatar_url: story.author.avatarUrl,
      role: story.author.role,
    },
  };
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
        select: { readCount: true },
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
        select: { readCount: true },
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
  searchStories,
  trackReadEvent,
  getStoryDetailBySlug,
  updateStory,
  deleteStory,
};
