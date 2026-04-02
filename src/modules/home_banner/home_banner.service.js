const prisma = require("../../config/prisma");
const {
  deleteFileByPublicUrl,
  uploadHomeBannerImageAndGetUrl,
} = require("../upload/upload.service");

const normalizeText = (value) => String(value ?? "").trim();

const parseSortOrder = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("sort_order phải là số nguyên không âm");
  }
  return parsed;
};

const formatStorySummary = (story) => ({
  id: story.id,
  title: story.title,
  slug: story.slug,
  description: story.description,
  cover_url: story.coverUrl,
  read_count: typeof story.stats?.readCount === "number" ? story.stats.readCount : 0,
  status: story.status,
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

const formatHomeBanner = (banner) => ({
  id: banner.id,
  banner_image_url: banner.bannerImageUrl,
  sort_order: banner.sortOrder,
  is_active: banner.isActive,
  created_at: banner.createdAt,
  updated_at: banner.updatedAt,
  story: banner.story ? formatStorySummary(banner.story) : null,
});

const bannerInclude = {
  story: {
    include: {
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
        },
      },
    },
  },
};

const getPublicHomeBanners = async () => {
  const banners = await prisma.homeBanner.findMany({
    where: {
      isActive: true,
      story: {
        status: "published",
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: bannerInclude,
  });

  return banners.map(formatHomeBanner);
};

const getHomeBanners = async ({ includeInactive = true } = {}) => {
  const banners = await prisma.homeBanner.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: bannerInclude,
  });

  return banners.map(formatHomeBanner);
};

const getNextSortOrder = async () => {
  const lastBanner = await prisma.homeBanner.findFirst({
    orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
    select: { sortOrder: true },
  });

  return (lastBanner?.sortOrder ?? -1) + 1;
};

const createHomeBanner = async ({
  storyId,
  sortOrder,
  isActive,
  bannerBuffer,
  bannerMimeType,
}) => {
  const normalizedStoryId = normalizeText(storyId);
  if (!normalizedStoryId) throw new Error("story_id không được để trống");

  const story = await prisma.story.findUnique({
    where: { id: normalizedStoryId },
    select: {
      id: true,
      status: true,
      homeBanner: { select: { id: true } },
    },
  });

  if (!story) throw new Error("Không tìm thấy truyện");
  if (story.status !== "published") {
    throw new Error("Chỉ có thể đưa truyện đã xuất bản lên banner");
  }
  if (story.homeBanner) {
    throw new Error("Truyện này đã có trong banner trang chủ");
  }

  const finalSortOrder =
    sortOrder === undefined ? await getNextSortOrder() : parseSortOrder(sortOrder);

  const bannerImageUrl = bannerBuffer
    ? await uploadHomeBannerImageAndGetUrl({
        ownerId: normalizedStoryId,
        bannerBuffer,
        bannerMimeType,
      })
    : null;

  const banner = await prisma.homeBanner.create({
    data: {
      storyId: normalizedStoryId,
      bannerImageUrl,
      sortOrder: finalSortOrder,
      isActive: isActive === undefined ? true : Boolean(isActive),
    },
    include: bannerInclude,
  });

  return formatHomeBanner(banner);
};

const updateHomeBanner = async ({
  bannerId,
  sortOrder,
  isActive,
  bannerBuffer,
  bannerMimeType,
}) => {
  const normalizedBannerId = normalizeText(bannerId);
  if (!normalizedBannerId) throw new Error("Thiếu id banner");

  const banner = await prisma.homeBanner.findUnique({
    where: { id: normalizedBannerId },
    include: bannerInclude,
  });
  if (!banner) throw new Error("Không tìm thấy banner");

  const data = {};

  if (sortOrder !== undefined) {
    data.sortOrder = parseSortOrder(sortOrder);
  }

  if (isActive !== undefined) {
    data.isActive = Boolean(isActive);
  }

  if (bannerBuffer) {
    data.bannerImageUrl = await uploadHomeBannerImageAndGetUrl({
      ownerId: banner.storyId,
      bannerBuffer,
      bannerMimeType,
    });
  }

  if (!Object.keys(data).length) {
    throw new Error("Không có dữ liệu hợp lệ để cập nhật");
  }

  const updatedBanner = await prisma.homeBanner.update({
    where: { id: banner.id },
    data,
    include: bannerInclude,
  });

  if (
    data.bannerImageUrl &&
    banner.bannerImageUrl &&
    banner.bannerImageUrl !== updatedBanner.bannerImageUrl
  ) {
    try {
      await deleteFileByPublicUrl(banner.bannerImageUrl);
    } catch (err) {
      console.error("Cleanup old home banner image failed:", err.message);
    }
  }

  return formatHomeBanner(updatedBanner);
};

const deleteHomeBanner = async ({ bannerId }) => {
  const normalizedBannerId = normalizeText(bannerId);
  if (!normalizedBannerId) throw new Error("Thiếu id banner");

  const totalBanners = await prisma.homeBanner.count();
  if (totalBanners <= 3) {
    throw new Error("Phải giữ ít nhất 3 banner, không thể xóa thêm");
  }

  const banner = await prisma.homeBanner.findUnique({
    where: { id: normalizedBannerId },
    select: { id: true, bannerImageUrl: true },
  });
  if (!banner) throw new Error("Không tìm thấy banner");

  await prisma.homeBanner.delete({
    where: { id: banner.id },
  });

  if (banner.bannerImageUrl) {
    try {
      await deleteFileByPublicUrl(banner.bannerImageUrl);
    } catch (err) {
      console.error("Cleanup home banner image on delete failed:", err.message);
    }
  }

  return { message: "Xóa banner trang chủ thành công" };
};

module.exports = {
  getPublicHomeBanners,
  getHomeBanners,
  createHomeBanner,
  updateHomeBanner,
  deleteHomeBanner,
};
