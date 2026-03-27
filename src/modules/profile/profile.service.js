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

module.exports = {
  getMyProfile,
  getProfileById,
  updateMyProfile,
  updateMyAvatar,
  deleteMyAvatar,
};
