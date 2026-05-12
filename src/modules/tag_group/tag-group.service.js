const prisma = require("../../config/prisma");

const normalizeText = (value) => String(value ?? "").trim();

const formatGroup = (group) => ({
  id: group.id,
  name: group.name,
  description: group.description,
  created_at: group.createdAt,
  updated_at: group.updatedAt,
});

const ADMIN_TAG_GROUP_SORT_FIELDS = new Set([
  "name",
  "tag_count",
  "updated_at",
  "created_at",
]);

const buildAdminTagGroupOrderBy = (sortBy, sortOrder) => {
  const direction = sortOrder === "asc" ? "asc" : "desc";
  const key = ADMIN_TAG_GROUP_SORT_FIELDS.has(sortBy) ? sortBy : "updated_at";
  switch (key) {
    case "name":
      return [{ name: direction }];
    case "tag_count":
      return [{ tags: { _count: direction } }, { updatedAt: "desc" }];
    case "created_at":
      return [{ createdAt: direction }];
    case "updated_at":
    default:
      return [{ updatedAt: direction }];
  }
};

const getAdminTagGroups = async ({
  keyword,
  page = 1,
  pageSize = 20,
  sortBy,
  sortOrder,
  tagFilter,
} = {}) => {
  const normalized = normalizeText(keyword).toLowerCase();
  const take = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const skip = Math.max(((Number(page) || 1) - 1) * take, 0);

  const tagFilterKey = normalizeText(tagFilter).toLowerCase();
  const whereParts = [];
  if (normalized) {
    whereParts.push({
      OR: [
        { name: { contains: normalized, mode: "insensitive" } },
        { description: { contains: normalized, mode: "insensitive" } },
      ],
    });
  }
  if (tagFilterKey === "empty") {
    whereParts.push({ tags: { none: {} } });
  } else if (tagFilterKey === "non_empty" || tagFilterKey === "has_tags") {
    whereParts.push({ tags: { some: {} } });
  }

  const where = whereParts.length === 0 ? {} : { AND: whereParts };
  const orderBy = buildAdminTagGroupOrderBy(sortBy, sortOrder);

  const [total, groups] = await Promise.all([
    prisma.tagGroup.count({ where }),
    prisma.tagGroup.findMany({
      where,
      skip,
      take,
      include: { _count: { select: { tags: true } } },
      orderBy,
    }),
  ]);

  return {
    total,
    items: groups.map((group) => ({
      ...formatGroup(group),
      tag_count: group._count?.tags ?? 0,
    })),
  };
};

const createTagGroup = async ({ name, description }) => {
  const normalizedName = normalizeText(name);
  const normalizedDescription = normalizeText(description);
  if (!normalizedName) throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
  if (normalizedName.length > 80) throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
  if (normalizedDescription.length > 1000) throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");

  const existed = await prisma.tagGroup.findFirst({
    where: { name: normalizedName },
    select: { id: true },
  });
  if (existed) throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");

  const group = await prisma.tagGroup.create({
    data: {
      name: normalizedName,
      description: normalizedDescription || null,
    },
  });

  return formatGroup(group);
};

const updateTagGroup = async ({ groupId, name, description }) => {
  const id = normalizeText(groupId);
  if (!id) throw new Error("Không tìm thấy nội dung bạn cần.");
  const group = await prisma.tagGroup.findUnique({ where: { id } });
  if (!group) throw new Error("Không tìm thấy nội dung bạn cần.");

  const data = {};

  if (name !== undefined) {
    const normalizedName = normalizeText(name);
    if (!normalizedName) throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
    if (normalizedName.length > 80) throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
    const existed = await prisma.tagGroup.findFirst({
      where: { name: normalizedName, id: { not: id } },
      select: { id: true },
    });
    if (existed) throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
    data.name = normalizedName;
  }

  if (description !== undefined) {
    const normalizedDescription = normalizeText(description);
    if (normalizedDescription.length > 1000) throw new Error("Vui lòng kiểm tra lại thông tin đã nhập.");
    data.description = normalizedDescription || null;
  }

  if (!Object.keys(data).length) throw new Error("Không tìm thấy nội dung bạn cần.");

  const updated = await prisma.tagGroup.update({ where: { id }, data });
  return formatGroup(updated);
};

const deleteTagGroup = async ({ groupId }) => {
  const id = normalizeText(groupId);
  if (!id) throw new Error("Không tìm thấy nội dung bạn cần.");

  const group = await prisma.tagGroup.findUnique({
    where: { id },
    include: { _count: { select: { tags: true } } },
  });
  if (!group) throw new Error("Không tìm thấy nội dung bạn cần.");

  if (group._count?.tags > 0) {
    throw new Error("Không thể xóa nhóm khi còn tag trong nhóm.");
  }

  await prisma.tagGroup.delete({ where: { id } });
  return { message: "Đã xóa nhóm tag thành công." };
};

module.exports = {
  getAdminTagGroups,
  createTagGroup,
  updateTagGroup,
  deleteTagGroup,
};

