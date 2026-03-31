const prisma = require("../../config/prisma");
const { uploadAvatarAndGetUrl } = require("../upload/upload.service");

const formatUserProfile = (user) => ({
  id: user.id,
  email: user.email,
  display_name: user.displayName,
  avatar_url: user.avatarUrl,
  bio: user.bio,
  role: user.role,
});

const getMyProfile = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Không tìm thấy người dùng");
  return formatUserProfile(user);
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

  if (!user) throw new Error("Không tìm thấy hồ sơ người dùng");

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
  if (!user) throw new Error("Không tìm thấy người dùng");

  const data = {};

  if (displayName !== undefined) {
    const normalizedDisplayName = String(displayName).trim();
    if (!normalizedDisplayName) throw new Error("displayName không được để trống");
    if (normalizedDisplayName.length > 50) {
      throw new Error("displayName tối đa 50 ký tự");
    }
    data.displayName = normalizedDisplayName;
  }

  if (bio !== undefined) {
    const normalizedBio = String(bio).trim();
    if (normalizedBio.length > 160) throw new Error("bio tối đa 160 ký tự");
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
    throw new Error("Không có dữ liệu hợp lệ để cập nhật");
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data,
  });

  return formatUserProfile(updatedUser);
};

const updateMyAvatar = async ({ userId, avatarBase64, avatarBuffer, avatarMimeType }) => {
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

  return formatUserProfile(updatedUser);
};

const deleteMyAvatar = async (userId) => {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: null },
  });

  return formatUserProfile(updatedUser);
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
  const normalizedLastPosition = lastPosition === undefined || lastPosition === null
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
