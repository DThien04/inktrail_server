const prisma = require("../../config/prisma");

const MAX_TAG_NAME_LENGTH = 40;
const normalizeText = (value) => String(value ?? "").trim();

const normalizeHashtagName = (value) =>
  normalizeText(value)
    .replace(/^#+/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const ensureValidHashtagName = (value) => {
  const normalized = normalizeHashtagName(value);
  if (!normalized) {
    throw new Error(
      "Tag phải theo dạng hashtag không dấu, chỉ gồm chữ thường, số hoặc dấu _",
    );
  }
  if (normalized.length > MAX_TAG_NAME_LENGTH) {
    throw new Error(`Tag tối đa ${MAX_TAG_NAME_LENGTH} ký tự`);
  }
  return normalized;
};

const formatTag = (tag) => ({
  id: tag.id,
  name: tag.name,
  description: tag.description,
  is_active: tag.isActive,
  created_at: tag.createdAt,
  updated_at: tag.updatedAt,
});

const createTag = async ({ name, description }) => {
  const normalizedName = ensureValidHashtagName(name);
  const normalizedDescription = normalizeText(description);
  if (normalizedDescription.length > 1000) {
    throw new Error("Mô tả tag tối đa 1000 ký tự");
  }

  const existed = await prisma.tag.findFirst({
    where: { name: normalizedName },
    select: { id: true },
  });
  if (existed) {
    throw new Error("Tag đã tồn tại");
  }

  const tag = await prisma.tag.create({
    data: {
      name: normalizedName,
      description: normalizedDescription || null,
      isActive: true,
    },
  });

  return formatTag(tag);
};

const getTags = async ({ includeInactive = false, keyword } = {}) => {
  const normalizedKeyword = normalizeHashtagName(keyword) || normalizeText(keyword).toLowerCase();

  const tags = await prisma.tag.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(normalizedKeyword
        ? {
            name: { contains: normalizedKeyword, mode: "insensitive" },
          }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return tags.map(formatTag);
};

const getTagById = async (tagId) => {
  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) throw new Error("Không tìm thấy tag");
  return formatTag(tag);
};

const updateTag = async ({ tagId, name, description }) => {
  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) throw new Error("Không tìm thấy tag");

  const data = {};

  if (name !== undefined) {
    const normalizedName = ensureValidHashtagName(name);
    const existed = await prisma.tag.findFirst({
      where: {
        name: normalizedName,
        id: { not: tag.id },
      },
      select: { id: true },
    });
    if (existed) {
      throw new Error("Tag đã tồn tại");
    }
    data.name = normalizedName;
  }

  if (description !== undefined) {
    const normalizedDescription = normalizeText(description);
    if (normalizedDescription.length > 1000) {
      throw new Error("Mô tả tag tối đa 1000 ký tự");
    }
    data.description = normalizedDescription || null;
  }

  if (!Object.keys(data).length) {
    throw new Error("Không có dữ liệu hợp lệ để cập nhật");
  }

  const updatedTag = await prisma.tag.update({
    where: { id: tag.id },
    data,
  });

  return formatTag(updatedTag);
};

const setTagActiveStatus = async ({ tagId, isActive }) => {
  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) throw new Error("Không tìm thấy tag");

  const updatedTag = await prisma.tag.update({
    where: { id: tag.id },
    data: { isActive: Boolean(isActive) },
  });

  return formatTag(updatedTag);
};

const deleteTag = async ({ tagId, hardDelete = false }) => {
  const tag = await prisma.tag.findUnique({
    where: { id: tagId },
    include: { _count: { select: { storyTags: true } } },
  });
  if (!tag) throw new Error("Không tìm thấy tag");

  if (hardDelete) {
    if (tag._count.storyTags > 0) {
      throw new Error("Không thể xóa cứng tag đang được gắn cho truyện");
    }
    await prisma.tag.delete({ where: { id: tag.id } });
    return { message: "Xóa tag thành công" };
  }

  await prisma.tag.update({
    where: { id: tag.id },
    data: { isActive: false },
  });
  return { message: "Đã ẩn tag thành công" };
};

module.exports = {
  createTag,
  getTags,
  getTagById,
  updateTag,
  setTagActiveStatus,
  deleteTag,
  normalizeHashtagName,
};
