const prisma = require("../../config/prisma");
const bcrypt = require("bcryptjs");
const { uploadAvatarAndGetUrl } = require("../upload/upload.service");
const notificationService = require("../notification/notification.service");

const formatUserProfile = (user, stats = {}) => ({
  id: user.id,
  email: user.email,
  display_name: user.displayName,
  avatar_url: user.avatarUrl,
  bio: user.bio,
  role: user.role,
  stories_read_count: stats.storiesReadCount ?? 0,
  following_author_count: stats.followingAuthorCount ?? 0,
  following_user_count: stats.followingAuthorCount ?? 0,
  follower_count: stats.followerCount ?? 0,
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
            chapterLikes: true,
            followingAuthors: true,
            authorFollowers: true,
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
      followingAuthorCount: user._count?.followingAuthors ?? 0,
      followerCount: user._count?.authorFollowers ?? 0,
      favoriteCount: user._count?.chapterLikes ?? 0,
    },
  };
};

const formatFollowedAuthor = (row) => ({
  id: row.author.id,
  user_id: row.author.id,
  display_name: row.author.displayName,
  avatar_url: row.author.avatarUrl,
  bio: row.author.bio,
  role: row.author.role,
  followed_at: row.createdAt,
  story_count: row.author._count?.stories ?? 0,
  follower_count: row.author._count?.authorFollowers ?? 0,
});

const formatFollower = (row) => ({
  id: row.follower.id,
  user_id: row.follower.id,
  display_name: row.follower.displayName,
  avatar_url: row.follower.avatarUrl,
  bio: row.follower.bio,
  role: row.follower.role,
  followed_at: row.createdAt,
  story_count: row.follower._count?.stories ?? 0,
  follower_count: row.follower._count?.authorFollowers ?? 0,
});

const getMyProfile = async (userId) => {
  const profileStats = await getProfileStats(userId);
  if (!profileStats) throw new Error("Không tìm thấy người dùng.");
  return formatUserProfile(profileStats.user, profileStats.stats);
};

const getProfileById = async ({ profileId, requesterId = null }) => {
  const [user, storyCount, followerCount, followingCount, followedRow] = await Promise.all([
    prisma.user.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    }),
    prisma.story.count({
      where: {
        authorId: profileId,
        status: "published",
      },
    }),
    prisma.authorFollow.count({
      where: { authorId: profileId },
    }),
    prisma.authorFollow.count({
      where: { followerId: profileId },
    }),
    requesterId
      ? prisma.authorFollow.findUnique({
          where: {
            followerId_authorId: {
              followerId: requesterId,
              authorId: profileId,
            },
          },
          select: { id: true },
        })
      : null,
  ]);

  if (!user) throw new Error("Không tìm thấy hồ sơ người dùng.");

  return {
    id: user.id,
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
    bio: user.bio,
    role: user.role,
    created_at: user.createdAt,
    story_count: storyCount,
    follower_count: followerCount,
    following_count: followingCount,
    is_following: Boolean(followedRow),
  };
};

const ensureAuthorCanBeFollowed = async (authorId) => {
  const normalizedAuthorId = String(authorId ?? "").trim();
  if (!normalizedAuthorId) throw new Error("Thiếu thông tin tác giả.");

  const user = await prisma.user.findUnique({
    where: { id: normalizedAuthorId },
    select: {
      id: true,
      role: true,
      displayName: true,
    },
  });

  if (!user) throw new Error("Không tìm thấy tác giả.");
  return user;
};

const followAuthor = async ({ followerId, authorId }) => {
  const author = await ensureAuthorCanBeFollowed(authorId);
  if (followerId === author.id) {
    throw new Error("Bạn không thể theo dõi chính mình.");
  }

  const existing = await prisma.authorFollow.findUnique({
    where: {
      followerId_authorId: {
        followerId,
        authorId: author.id,
      },
    },
  });

  if (!existing) {
    await prisma.authorFollow.create({
      data: {
        followerId,
        authorId: author.id,
      },
    });

    await notificationService.createNotification({
      recipientId: author.id,
      actorId: followerId,
      type: "system",
      title: "Bạn có người theo dõi mới",
      body: "Một độc giả vừa bắt đầu theo dõi bạn.",
      linkUrl: `/profile/${author.id}`,
      meta: {
        user_id: author.id,
        user_name: author.displayName,
      },
    });
  }

  const followerCount = await prisma.authorFollow.count({
    where: { authorId: author.id },
  });

  return {
    user_id: author.id,
    author_id: author.id,
    is_following: true,
    follower_count: followerCount,
  };
};

const unfollowAuthor = async ({ followerId, authorId }) => {
  const author = await ensureAuthorCanBeFollowed(authorId);
  if (followerId === author.id) {
    throw new Error("Bạn không thể bỏ theo dõi chính mình theo cách này.");
  }

  await prisma.authorFollow.delete({
    where: {
      followerId_authorId: {
        followerId,
        authorId: author.id,
      },
    },
  });

  const followerCount = await prisma.authorFollow.count({
    where: { authorId: author.id },
  });

  return {
    user_id: author.id,
    author_id: author.id,
    is_following: false,
    follower_count: followerCount,
  };
};

const listFollowedAuthors = async ({ userId, limit = 50 }) => {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const rows = await prisma.authorFollow.findMany({
    where: { followerId: userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    include: {
      author: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          role: true,
          _count: {
            select: {
              stories: {
                where: {
                  status: "published",
                },
              },
              authorFollowers: true,
            },
          },
        },
      },
    },
  });

  return rows.map(formatFollowedAuthor);
};

const listFollowers = async ({ userId, limit = 50 }) => {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const rows = await prisma.authorFollow.findMany({
    where: { authorId: userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    include: {
      follower: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          role: true,
          _count: {
            select: {
              stories: {
                where: {
                  status: "published",
                },
              },
              authorFollowers: true,
            },
          },
        },
      },
    },
  });

  return rows.map(formatFollower);
};

const followUser = async ({ followerId, targetUserId }) =>
  followAuthor({ followerId, authorId: targetUserId });

const unfollowUser = async ({ followerId, targetUserId }) =>
  unfollowAuthor({ followerId, authorId: targetUserId });

const listFollowedUsers = async ({ userId, limit = 50 }) =>
  listFollowedAuthors({ userId, limit });

const updateMyProfile = async ({
  userId,
  displayName,
  bio,
  avatarBase64,
  avatarBuffer,
  avatarMimeType,
}) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Không tìm thấy người dùng.");

  const data = {};

  if (displayName !== undefined) {
    const normalizedDisplayName = String(displayName).trim();
    if (!normalizedDisplayName) throw new Error("Tên hiển thị không được để trống.");
    if (normalizedDisplayName.length > 50) {
      throw new Error("Tên hiển thị tối đa 50 ký tự.");
    }
    data.displayName = normalizedDisplayName;
  }

  if (bio !== undefined) {
    const normalizedBio = String(bio).trim();
    if (normalizedBio.length > 160) throw new Error("Giới thiệu tối đa 160 ký tự.");
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
    throw new Error("Chưa có thông tin nào để cập nhật.");
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

const changeMyPassword = async ({ userId, oldPassword, newPassword }) => {
  const normalizedOldPassword = String(oldPassword ?? "");
  const normalizedNewPassword = String(newPassword ?? "");

  if (!normalizedOldPassword || !normalizedNewPassword) {
    throw new Error("Vui lòng nhập đủ mật khẩu cũ và mật khẩu mới.");
  }

  if (normalizedNewPassword.length < 6) {
    throw new Error("Mật khẩu mới cần ít nhất 6 ký tự.");
  }

  if (normalizedOldPassword === normalizedNewPassword) {
    throw new Error("Mật khẩu mới cần khác mật khẩu hiện tại.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });
  if (!user) throw new Error("Không tìm thấy tài khoản.");

  const isMatch = await bcrypt.compare(normalizedOldPassword, user.password);
  if (!isMatch) throw new Error("Mật khẩu hiện tại chưa đúng.");

  const hashedPassword = await bcrypt.hash(normalizedNewPassword, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    // Revoke all refresh tokens after password change for safer sessions.
    await tx.refreshToken.deleteMany({
      where: { userId: user.id },
    });
  });
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
  followUser,
  unfollowUser,
  listFollowedUsers,
  listFollowers,
  followAuthor,
  unfollowAuthor,
  listFollowedAuthors,
  updateMyProfile,
  changeMyPassword,
  updateMyAvatar,
  deleteMyAvatar,
  getMyReadingProgressByStory,
  upsertMyReadingProgress,
  listMyReadingProgress,
};

