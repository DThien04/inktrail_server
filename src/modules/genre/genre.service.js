const prisma = require("../../config/prisma");

const normalizeText = (value) => String(value ?? "").trim();

const slugify = (value) => {
  const base = normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return base || "genre";
};

const ensureUniqueGenreSlug = async ({ name, slug, excludeGenreId }) => {
  const raw = normalizeText(slug) || name;
  const baseSlug = slugify(raw);
  let candidate = baseSlug;
  let suffix = 1;

  while (true) {
    const existed = await prisma.genre.findFirst({
      where: {
        slug: candidate,
        ...(excludeGenreId ? { id: { not: excludeGenreId } } : {}),
      },
      select: { id: true },
    });

    if (!existed) return candidate;
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
};

const formatGenre = (genre) => ({
  id: genre.id,
  name: genre.name,
  slug: genre.slug,
  description: genre.description,
  is_active: genre.isActive,
  created_at: genre.createdAt,
  updated_at: genre.updatedAt,
});

const createGenre = async ({ name, slug, description, isActive }) => {
  const normalizedName = normalizeText(name);
  if (!normalizedName) throw new Error("Tên thể loại không được để trống");
  if (normalizedName.length > 100) throw new Error("Tên thể loại tối đa 100 ký tự");

  const normalizedDescription = normalizeText(description);
  if (normalizedDescription.length > 1000) {
    throw new Error("Mô tả thể loại tối đa 1000 ký tự");
  }

  const finalSlug = await ensureUniqueGenreSlug({
    name: normalizedName,
    slug,
  });

  const genre = await prisma.genre.create({
    data: {
      name: normalizedName,
      slug: finalSlug,
      description: normalizedDescription || null,
      isActive: isActive === undefined ? true : Boolean(isActive),
    },
  });

  return formatGenre(genre);
};

const getGenres = async ({ includeInactive = false, keyword } = {}) => {
  const normalizedKeyword = normalizeText(keyword);

  const genres = await prisma.genre.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(normalizedKeyword
        ? {
            OR: [
              { name: { contains: normalizedKeyword, mode: "insensitive" } },
              { slug: { contains: normalizedKeyword, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return genres.map(formatGenre);
};

const getGenreById = async (genreId) => {
  const genre = await prisma.genre.findUnique({ where: { id: genreId } });
  if (!genre) throw new Error("Không tìm thấy thể loại");
  return formatGenre(genre);
};

const updateGenre = async ({ genreId, name, slug, description, isActive }) => {
  const genre = await prisma.genre.findUnique({ where: { id: genreId } });
  if (!genre) throw new Error("Không tìm thấy thể loại");

  const data = {};

  if (name !== undefined) {
    const normalizedName = normalizeText(name);
    if (!normalizedName) throw new Error("Tên thể loại không được để trống");
    if (normalizedName.length > 100) throw new Error("Tên thể loại tối đa 100 ký tự");
    data.name = normalizedName;
  }

  if (description !== undefined) {
    const normalizedDescription = normalizeText(description);
    if (normalizedDescription.length > 1000) {
      throw new Error("Mô tả thể loại tối đa 1000 ký tự");
    }
    data.description = normalizedDescription || null;
  }

  if (isActive !== undefined) {
    data.isActive = Boolean(isActive);
  }

  if (slug !== undefined || (name !== undefined && !genre.slug)) {
    data.slug = await ensureUniqueGenreSlug({
      name: data.name || genre.name,
      slug,
      excludeGenreId: genre.id,
    });
  }

  if (!Object.keys(data).length) {
    throw new Error("Không có dữ liệu hợp lệ để cập nhật");
  }

  const updatedGenre = await prisma.genre.update({
    where: { id: genre.id },
    data,
  });

  return formatGenre(updatedGenre);
};

const deleteGenre = async ({ genreId, hardDelete = false }) => {
  const genre = await prisma.genre.findUnique({
    where: { id: genreId },
    include: { _count: { select: { storyGenres: true } } },
  });
  if (!genre) throw new Error("Không tìm thấy thể loại");

  if (hardDelete) {
    if (genre._count.storyGenres > 0) {
      throw new Error("Không thể xóa cứng thể loại đang được gán cho truyện");
    }
    await prisma.genre.delete({ where: { id: genre.id } });
    return { message: "Xóa thể loại thành công" };
  }

  await prisma.genre.update({
    where: { id: genre.id },
    data: { isActive: false },
  });
  return { message: "Đã ẩn thể loại thành công" };
};

module.exports = {
  createGenre,
  getGenres,
  getGenreById,
  updateGenre,
  deleteGenre,
};
