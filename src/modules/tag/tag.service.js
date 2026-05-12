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
    throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
  }
  return normalized;
};

const formatTag = (tag) => ({
  id: tag.id,
  name: tag.name,
  description: tag.description,
  is_active: tag.isActive,
  group: tag.group
    ? {
        id: tag.group.id,
        name: tag.group.name,
      }
    : null,
  story_count: tag._count?.storyTags ?? 0,
  created_at: tag.createdAt,
  updated_at: tag.updatedAt,
});

const createTag = async ({ name, description }) => {
  const normalizedName = ensureValidHashtagName(name);
  const normalizedDescription = normalizeText(description);
  if (normalizedDescription.length > 1000) {
    throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
  }

  const existed = await prisma.tag.findFirst({
    where: { name: normalizedName },
    select: { id: true },
  });
  if (existed) {
    throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
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
    include: {
      group: { select: { id: true, name: true } },
      _count: { select: { storyTags: true } },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return tags.map(formatTag);
};

const getTagById = async (tagId) => {
  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) throw new Error("Không tìm thấy nội dung bạn cần.");
  return formatTag(tag);
};

const updateTag = async ({ tagId, name, description, groupId }) => {
  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) throw new Error("Không tìm thấy nội dung bạn cần.");

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
      throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
    }
    data.name = normalizedName;
  }

  if (description !== undefined) {
    const normalizedDescription = normalizeText(description);
    if (normalizedDescription.length > 1000) {
      throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
    }
    data.description = normalizedDescription || null;
  }

  if (groupId !== undefined) {
    const normalizedGroupId = normalizeText(groupId);
    if (normalizedGroupId) {
      const group = await prisma.tagGroup.findUnique({
        where: { id: normalizedGroupId },
        select: { id: true },
      });
      if (!group) throw new Error("Không tìm thấy nội dung bạn cần.");
      data.groupId = normalizedGroupId;
    } else {
      data.groupId = null;
    }
  }

  if (!Object.keys(data).length) {
    throw new Error("Không tìm thấy nội dung bạn cần.");
  }

  const updatedTag = await prisma.tag.update({
    where: { id: tag.id },
    data,
  });

  return formatTag(updatedTag);
};

const setTagsGroupBulk = async ({ tagIds, groupId }) => {
  const idsRaw = Array.isArray(tagIds) ? tagIds : [];
  const ids = [...new Set(idsRaw.map(normalizeText).filter(Boolean))];
  if (!ids.length) throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");

  const normalizedGroupId = normalizeText(groupId);
  if (normalizedGroupId) {
    const group = await prisma.tagGroup.findUnique({
      where: { id: normalizedGroupId },
      select: { id: true },
    });
    if (!group) throw new Error("Không tìm thấy nội dung bạn cần.");
  }

  const existedCount = await prisma.tag.count({
    where: { id: { in: ids } },
  });
  if (existedCount !== ids.length) throw new Error("Không tìm thấy nội dung bạn cần.");

  await prisma.tag.updateMany({
    where: { id: { in: ids } },
    data: { groupId: normalizedGroupId || null },
  });

  return {
    message: normalizedGroupId
      ? "Đã cập nhật nhóm cho các tag đã chọn."
      : "Đã bỏ nhóm cho các tag đã chọn.",
  };
};

const setTagActiveStatus = async ({ tagId, isActive }) => {
  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) throw new Error("Không tìm thấy nội dung bạn cần.");

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
  if (!tag) throw new Error("Không tìm thấy nội dung bạn cần.");

  if (hardDelete) {
    if (tag._count.storyTags > 0) {
      throw new Error("Không tìm thấy nội dung bạn cần.");
    }
    await prisma.tag.delete({ where: { id: tag.id } });
    return { message: "Đã xóa tag thành công." };
  }

  await prisma.tag.update({
    where: { id: tag.id },
    data: { isActive: false },
  });
  return { message: "Đã ẩn tag thành công." };
};

const ADMIN_TAG_SORT_FIELDS = new Set([
  "name",
  "usage_count",
  "updated_at",
  "created_at",
]);

const buildAdminTagOrderBy = (sortBy, sortOrder) => {
  const direction = sortOrder === "asc" ? "asc" : "desc";
  const key = ADMIN_TAG_SORT_FIELDS.has(sortBy) ? sortBy : "updated_at";
  switch (key) {
    case "name":
      return [{ name: direction }];
    case "usage_count":
      return [{ storyTags: { _count: direction } }, { updatedAt: "desc" }];
    case "created_at":
      return [{ createdAt: direction }];
    case "updated_at":
    default:
      return [{ updatedAt: direction }];
  }
};

const getAdminTags = async ({
  keyword,
  groupId,
  ungroupedOnly = false,
  page = 1,
  pageSize = 20,
  sortBy,
  sortOrder,
} = {}) => {
  const normalizedKeyword =
    normalizeHashtagName(keyword) || normalizeText(keyword).toLowerCase();
  const take = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const skip = Math.max(((Number(page) || 1) - 1) * take, 0);

  const where = {
    ...(normalizedKeyword
      ? { name: { contains: normalizedKeyword, mode: "insensitive" } }
      : {}),
    ...(ungroupedOnly
      ? { groupId: null }
      : normalizeText(groupId)
        ? { groupId: normalizeText(groupId) }
        : {}),
  };

  const orderBy = buildAdminTagOrderBy(sortBy, sortOrder);

  const [total, tags] = await Promise.all([
    prisma.tag.count({ where }),
    prisma.tag.findMany({
      where,
      skip,
      take,
      include: { _count: { select: { storyTags: true } }, group: true },
      orderBy,
    }),
  ]);

  return {
    total,
    items: tags.map((tag) => ({
      ...formatTag(tag),
      usage_count: tag._count?.storyTags ?? 0,
    })),
  };
};

const mergeTag = async ({ fromTagId, toTagId }) => {
  const fromId = normalizeText(fromTagId);
  const toId = normalizeText(toTagId);
  if (!fromId || !toId || fromId === toId) {
    throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
  }

  const [fromTag, toTag] = await Promise.all([
    prisma.tag.findUnique({
      where: { id: fromId },
      include: { _count: { select: { storyTags: true } } },
    }),
    prisma.tag.findUnique({ where: { id: toId } }),
  ]);
  if (!fromTag || !toTag) throw new Error("Không tìm thấy nội dung bạn cần.");

  const storyRows = await prisma.storyTag.findMany({
    where: { tagId: fromId },
    select: { storyId: true },
  });

  await prisma.$transaction(async (tx) => {
    if (storyRows.length) {
      await tx.storyTag.createMany({
        data: storyRows.map((row) => ({ storyId: row.storyId, tagId: toId })),
        skipDuplicates: true,
      });
      await tx.storyTag.deleteMany({ where: { tagId: fromId } });
    }
    await tx.tag.delete({ where: { id: fromId } });
  });

  return {
    message: `Đã gộp tag #${fromTag.name} vào #${toTag.name}.`,
  };
};

const mergeTagsBulk = async ({ fromTagIds, toTagId }) => {
  const toId = normalizeText(toTagId);
  const fromIdsRaw = Array.isArray(fromTagIds) ? fromTagIds : [];
  const fromIds = [...new Set(fromIdsRaw.map(normalizeText).filter(Boolean))].filter(
    (id) => id !== toId,
  );

  if (!toId || fromIds.length === 0) {
    throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
  }

  const [toTag, fromTags] = await Promise.all([
    prisma.tag.findUnique({ where: { id: toId } }),
    prisma.tag.findMany({ where: { id: { in: fromIds } } }),
  ]);
  if (!toTag || fromTags.length !== fromIds.length) {
    throw new Error("Không tìm thấy nội dung bạn cần.");
  }

  await prisma.$transaction(async (tx) => {
    const storyRows = await tx.storyTag.findMany({
      where: { tagId: { in: fromIds } },
      select: { storyId: true, tagId: true },
    });

    if (storyRows.length) {
      await tx.storyTag.createMany({
        data: storyRows.map((row) => ({ storyId: row.storyId, tagId: toId })),
        skipDuplicates: true,
      });
      await tx.storyTag.deleteMany({ where: { tagId: { in: fromIds } } });
    }

    await tx.tag.deleteMany({ where: { id: { in: fromIds } } });
  });

  return {
    message: `Đã gộp ${fromIds.length} tag vào #${toTag.name}.`,
  };
};

module.exports = {
  createTag,
  getTags,
  getAdminTags,
  getTagById,
  updateTag,
  setTagsGroupBulk,
  setTagActiveStatus,
  deleteTag,
  mergeTag,
  mergeTagsBulk,
  normalizeHashtagName,
};

