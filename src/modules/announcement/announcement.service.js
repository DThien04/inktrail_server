const prisma = require("../../config/prisma");

const normalizeText = (value) => String(value ?? "").trim();
const ALLOWED_TYPES = new Set(["system", "release", "event", "maintenance"]);

const normalizeType = (value, fallback = "system") => {
  const type = normalizeText(value) || fallback;
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error("announcement type is invalid");
  }
  return type;
};

const parseBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("is_active must be true or false");
};

const parseDateTime = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} is invalid`);
  }
  return parsed;
};

const parseLimit = (value, fallback = 20, max = 50) => {
  if (value === undefined || value === null || value === "") return fallback;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error("limit must be a positive integer");
  }
  return Math.min(num, max);
};

const formatAnnouncement = (announcement) => ({
  id: announcement.id,
  title: announcement.title,
  body: announcement.body,
  link_url: announcement.linkUrl,
  type: announcement.type,
  is_active: announcement.isActive,
  published_at: announcement.publishedAt,
  created_at: announcement.createdAt,
  updated_at: announcement.updatedAt,
});

const listPublicAnnouncements = async ({ limit }) => {
  const now = new Date();
  const rows = await prisma.announcement.findMany({
    where: {
      isActive: true,
      publishedAt: { lte: now },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: parseLimit(limit),
  });

  return rows.map(formatAnnouncement);
};

const listAdminAnnouncements = async () => {
  const rows = await prisma.announcement.findMany({
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

  return rows.map(formatAnnouncement);
};

const createAnnouncement = async ({
  title,
  body,
  linkUrl,
  type,
  isActive,
  publishedAt,
}) => {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) {
    throw new Error("title is required");
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: normalizedTitle,
      body: normalizeText(body) || null,
      linkUrl: normalizeText(linkUrl) || null,
      type: normalizeType(type),
      isActive: parseBoolean(isActive, true),
      publishedAt: parseDateTime(publishedAt, "published_at") ?? new Date(),
    },
  });

  return formatAnnouncement(announcement);
};

const updateAnnouncement = async ({
  announcementId,
  title,
  body,
  linkUrl,
  type,
  isActive,
  publishedAt,
}) => {
  const normalizedId = normalizeText(announcementId);
  if (!normalizedId) {
    throw new Error("announcement id is required");
  }

  const existed = await prisma.announcement.findUnique({
    where: { id: normalizedId },
    select: { id: true },
  });
  if (!existed) {
    throw new Error("announcement not found");
  }

  const data = {};
  if (title !== undefined) {
    const normalizedTitle = normalizeText(title);
    if (!normalizedTitle) {
      throw new Error("title cannot be empty");
    }
    data.title = normalizedTitle;
  }
  if (body !== undefined) {
    data.body = normalizeText(body) || null;
  }
  if (linkUrl !== undefined) {
    data.linkUrl = normalizeText(linkUrl) || null;
  }
  if (type !== undefined) {
    data.type = normalizeType(type);
  }
  if (isActive !== undefined) {
    data.isActive = parseBoolean(isActive);
  }
  if (publishedAt !== undefined) {
    data.publishedAt = parseDateTime(publishedAt, "published_at");
  }

  if (!Object.keys(data).length) {
    throw new Error("no valid data to update");
  }

  const announcement = await prisma.announcement.update({
    where: { id: normalizedId },
    data,
  });

  return formatAnnouncement(announcement);
};

const deleteAnnouncement = async ({ announcementId }) => {
  const normalizedId = normalizeText(announcementId);
  if (!normalizedId) {
    throw new Error("announcement id is required");
  }

  await prisma.announcement.delete({
    where: { id: normalizedId },
  });

  return { message: "Announcement deleted successfully" };
};

module.exports = {
  listPublicAnnouncements,
  listAdminAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
