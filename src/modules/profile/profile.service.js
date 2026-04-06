const prisma = require("../../config/prisma");
const { uploadAvatarAndGetUrl } = require("../upload/upload.service");

const formatUserProfile = (user, stats = {}) => ({
  id: user.id,
  email: user.email,
  display_name: user.displayName,
  avatar_url: user.avatarUrl,
  bio: user.bio,
  role: user.role,
  stories_read_count: stats.storiesReadCount ?? 0,
  currently_reading_count: stats.currentlyReadingCount ?? 0,
  favorite_count: stats.favoriteCount ?? 0,
});

const getProfileStats = async (userId) => {
  const [user, distinctReadStories] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            readingProgresses: true,
            storyLikes: true,
          },
        },
      },
    }),
    prisma.storyReadSession.findMany({
      where: { userId },
      distinct: ["storyId"],
      select: { storyId: true },
    }),
  ]);

  if (!user) return null;

  return {
    user,
    stats: {
      storiesReadCount: distinctReadStories.length,
      currentlyReadingCount: user._count?.readingProgresses ?? 0,
      favoriteCount: user._count?.storyLikes ?? 0,
    },
  };
};

const getMyProfile = async (userId) => {
  const profileStats = await getProfileStats(userId);
  if (!profileStats) throw new Error("Khong tim thay nguoi dung");
  return formatUserProfile(profileStats.user, profileStats.stats);
};

const getProfileById = async (profileId) => {
  const user = await prisma.user.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) throw new Error("Khong tim thay ho so nguoi dung");

  return {
    id: user.id,
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
    bio: user.bio,
    role: user.role,
    created_at: user.createdAt,
  };
};

const updateMyProfile = async ({
  userId,
  displayName,
  bio,
  avatarBase64,
  avatarBuffer,
  avatarMimeType,
}) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Khong tim thay nguoi dung");

  const data = {};

  if (displayName !== undefined) {
    const normalizedDisplayName = String(displayName).trim();
    if (!normalizedDisplayName) throw new Error("displayName khong duoc de trong");
    if (normalizedDisplayName.length > 50) {
      throw new Error("displayName toi da 50 ky tu");
    }
    data.displayName = normalizedDisplayName;
  }

  if (bio !== undefined) {
    const normalizedBio = String(bio).trim();
    if (normalizedBio.length > 160) throw new Error("bio toi da 160 ky tu");
    data.bio = normalizedBio || null;
  }

  if (avatarBase64 !== undefined || avatarBuffer) {
    data.avatarUrl = await uploadAvatarAndGetUrl({
      userId,
      avatarBase64,
      avatarBuffer,
      avatarMimeType,
    });
  }

  if (!Object.keys(data).length) {
    throw new Error("Khong co du lieu hop le de cap nhat");
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data,
  });

  const profileStats = await getProfileStats(updatedUser.id);
  return formatUserProfile(
    updatedUser,
    profileStats?.stats,
  );
};

const updateMyAvatar = async ({
  userId,
  avatarBase64,
  avatarBuffer,
  avatarMimeType,
}) => {
  const avatarUrl = await uploadAvatarAndGetUrl({
    userId,
    avatarBase64,
    avatarBuffer,
    avatarMimeType,
  });

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
  });

  const profileStats = await getProfileStats(updatedUser.id);
  return formatUserProfile(
    updatedUser,
    profileStats?.stats,
  );
};

const deleteMyAvatar = async (userId) => {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: null },
  });

  const profileStats = await getProfileStats(updatedUser.id);
  return formatUserProfile(
    updatedUser,
    profileStats?.stats,
  );
};

const formatReadingProgress = (progress) => ({
  id: progress.id,
  user_id: progress.userId,
  story_id: progress.storyId,
  last_chapter_index: progress.lastChapterIndex,
  last_position: progress.lastPosition,
  created_at: progress.createdAt,
  updated_at: progress.updatedAt,
});

const normalizeStoryId = (value) => String(value ?? "").trim();

const parseNonNegativeInt = (value, fieldName) => {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return num;
};

const ensureStoryExists = async (storyId) => {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true },
  });
  if (!story) throw new Error("Story not found");
};

const getMyReadingProgressByStory = async ({ userId, storyId }) => {
  const normalizedStoryId = normalizeStoryId(storyId);
  if (!normalizedStoryId) throw new Error("story_id is required");

  await ensureStoryExists(normalizedStoryId);

  const progress = await prisma.readingProgress.findUnique({
    where: {
      userId_storyId: {
        userId,
        storyId: normalizedStoryId,
      },
    },
  });

  if (!progress) return null;
  return formatReadingProgress(progress);
};

const upsertMyReadingProgress = async ({
  userId,
  storyId,
  lastChapterIndex,
  lastPosition,
}) => {
  const normalizedStoryId = normalizeStoryId(storyId);
  if (!normalizedStoryId) throw new Error("story_id is required");
  await ensureStoryExists(normalizedStoryId);

  const normalizedChapterIndex = parseNonNegativeInt(
    lastChapterIndex,
    "last_chapter_index",
  );
  const normalizedLastPosition =
    lastPosition === undefined || lastPosition === null
      ? null
      : parseNonNegativeInt(lastPosition, "last_position");

  const progress = await prisma.readingProgress.upsert({
    where: {
      userId_storyId: {
        userId,
        storyId: normalizedStoryId,
      },
    },
    create: {
      userId,
      storyId: normalizedStoryId,
      lastChapterIndex: normalizedChapterIndex,
      lastPosition: normalizedLastPosition,
    },
    update: {
      lastChapterIndex: normalizedChapterIndex,
      lastPosition: normalizedLastPosition,
    },
  });

  return formatReadingProgress(progress);
};

const listMyReadingProgress = async ({ userId, limit = 20 }) => {
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const rows = await prisma.readingProgress.findMany({
    where: { userId },
    include: {
      story: {
        select: {
          id: true,
          title: true,
          slug: true,
          coverUrl: true,
          status: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take,
  });

  return rows.map((row) => ({
    ...formatReadingProgress(row),
    story: row.story
      ? {
          id: row.story.id,
          title: row.story.title,
          slug: row.story.slug,
          cover_url: row.story.coverUrl,
          status: row.story.status,
        }
      : null,
  }));
};

module.exports = {
  getMyProfile,
  getProfileById,
  updateMyProfile,
  updateMyAvatar,
  deleteMyAvatar,
  getMyReadingProgressByStory,
  upsertMyReadingProgress,
  listMyReadingProgress,
};
