const prisma = require("../../config/prisma");

const ALLOWED_CHAPTER_STATUSES = new Set(["draft", "published"]);

const normalizeText = (value) => String(value ?? "").trim();

const formatChapter = (chapter) => ({
  id: chapter.id,
  story_id: chapter.storyId,
  chapter_number: chapter.chapterNumber,
  title: chapter.title,
  content: chapter.content,
  status: chapter.status,
  published_at: chapter.publishedAt,
  created_at: chapter.createdAt,
  updated_at: chapter.updatedAt,
});

const ensureCanManageStory = ({ story, requester }) => {
  const isOwner = story.authorId === requester.id;
  const isAdmin = requester.role === "admin";
  if (!isOwner && !isAdmin) {
    throw new Error("Bạn không có quyền thao tác chương của truyện này");
  }
};

const parseChapterNumber = (value) => {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error("chapter_number phải là số nguyên dương");
  }
  return num;
};

const normalizeStatus = (value, fallback = "draft") => {
  const normalized = normalizeText(value) || fallback;
  if (!ALLOWED_CHAPTER_STATUSES.has(normalized)) {
    throw new Error("Trạng thái chương không hợp lệ");
  }
  return normalized;
};

const normalizeMoveDirection = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized !== "up" && normalized !== "down") {
    throw new Error("direction phải là up hoặc down");
  }
  return normalized;
};

const createChapter = async ({
  storyId,
  requester,
  chapterNumber,
  title,
  content,
  status,
}) => {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, authorId: true },
  });
  if (!story) throw new Error("Không tìm thấy truyện");

  ensureCanManageStory({ story, requester });

  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) throw new Error("Tiêu đề chương không được để trống");
  if (normalizedTitle.length > 255) throw new Error("Tiêu đề chương tối đa 255 ký tự");

  const normalizedContent = normalizeText(content);
  if (!normalizedContent) throw new Error("Nội dung chương không được để trống");

  const normalizedChapterNumber = parseChapterNumber(chapterNumber);
  const normalizedStatus = normalizeStatus(status);

  const existed = await prisma.chapter.findUnique({
    where: {
      storyId_chapterNumber: {
        storyId,
        chapterNumber: normalizedChapterNumber,
      },
    },
    select: { id: true },
  });
  if (existed) throw new Error("Số chương đã tồn tại trong truyện này");

  const chapter = await prisma.chapter.create({
    data: {
      storyId,
      chapterNumber: normalizedChapterNumber,
      title: normalizedTitle,
      content: normalizedContent,
      status: normalizedStatus,
      publishedAt: normalizedStatus === "published" ? new Date() : null,
    },
  });

  return formatChapter(chapter);
};

const getChaptersByStory = async ({ storyId, requester }) => {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, authorId: true, status: true },
  });
  if (!story) throw new Error("Không tìm thấy truyện");

  const isOwner = requester?.id && story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  const canViewDraft = Boolean(isOwner || isAdmin);

  const chapters = await prisma.chapter.findMany({
    where: {
      storyId,
      ...(canViewDraft ? {} : { status: "published" }),
    },
    orderBy: { chapterNumber: "asc" },
  });

  return chapters.map(formatChapter);
};

const getChapterDetail = async ({ chapterId, requester }) => {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      story: {
        select: {
          id: true,
          title: true,
          slug: true,
          authorId: true,
          status: true,
        },
      },
    },
  });
  if (!chapter) throw new Error("Không tìm thấy chương");

  const isOwner = requester?.id && chapter.story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  const canViewDraft = Boolean(isOwner || isAdmin);
  if (chapter.status !== "published" && !canViewDraft) {
    throw new Error("Chương chưa được xuất bản");
  }

  return {
    ...formatChapter(chapter),
    story: {
      id: chapter.story.id,
      title: chapter.story.title,
      slug: chapter.story.slug,
      status: chapter.story.status,
    },
  };
};

const updateChapter = async ({
  chapterId,
  requester,
  chapterNumber,
  title,
  content,
  status,
}) => {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { story: { select: { id: true, authorId: true } } },
  });
  if (!chapter) throw new Error("Không tìm thấy chương");

  ensureCanManageStory({ story: chapter.story, requester });

  const data = {};

  if (title !== undefined) {
    const normalizedTitle = normalizeText(title);
    if (!normalizedTitle) throw new Error("Tiêu đề chương không được để trống");
    if (normalizedTitle.length > 255) {
      throw new Error("Tiêu đề chương tối đa 255 ký tự");
    }
    data.title = normalizedTitle;
  }

  if (content !== undefined) {
    const normalizedContent = normalizeText(content);
    if (!normalizedContent) throw new Error("Nội dung chương không được để trống");
    data.content = normalizedContent;
  }

  if (chapterNumber !== undefined) {
    const normalizedChapterNumber = parseChapterNumber(chapterNumber);
    const existed = await prisma.chapter.findUnique({
      where: {
        storyId_chapterNumber: {
          storyId: chapter.storyId,
          chapterNumber: normalizedChapterNumber,
        },
      },
      select: { id: true },
    });

    if (existed && existed.id !== chapter.id) {
      throw new Error("Số chương đã tồn tại trong truyện này");
    }
    data.chapterNumber = normalizedChapterNumber;
  }

  if (status !== undefined) {
    const normalizedStatus = normalizeStatus(status);
    data.status = normalizedStatus;
    if (normalizedStatus === "published" && !chapter.publishedAt) {
      data.publishedAt = new Date();
    }
    if (normalizedStatus === "draft") {
      data.publishedAt = null;
    }
  }

  if (!Object.keys(data).length) {
    throw new Error("Không có dữ liệu hợp lệ để cập nhật");
  }

  const updatedChapter = await prisma.chapter.update({
    where: { id: chapter.id },
    data,
  });

  return formatChapter(updatedChapter);
};

const moveChapter = async ({ chapterId, requester, direction }) => {
  const normalizedDirection = normalizeMoveDirection(direction);

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { story: { select: { id: true, authorId: true } } },
  });
  if (!chapter) throw new Error("Không tìm thấy chương");

  ensureCanManageStory({ story: chapter.story, requester });

  const neighbor = await prisma.chapter.findFirst({
    where: {
      storyId: chapter.storyId,
      chapterNumber:
        normalizedDirection === "up"
          ? { lt: chapter.chapterNumber }
          : { gt: chapter.chapterNumber },
    },
    orderBy: {
      chapterNumber: normalizedDirection === "up" ? "desc" : "asc",
    },
  });

  if (!neighbor) {
    throw new Error(
      normalizedDirection === "up"
        ? "Chương này đã ở đầu danh sách"
        : "Chương này đã ở cuối danh sách",
    );
  }

  const maxChapterNumber = await prisma.chapter.aggregate({
    where: { storyId: chapter.storyId },
    _max: { chapterNumber: true },
  });
  const tempChapterNumber = (maxChapterNumber._max.chapterNumber || 0) + 1000;

  await prisma.$transaction([
    prisma.chapter.update({
      where: { id: chapter.id },
      data: { chapterNumber: tempChapterNumber },
    }),
    prisma.chapter.update({
      where: { id: neighbor.id },
      data: { chapterNumber: chapter.chapterNumber },
    }),
    prisma.chapter.update({
      where: { id: chapter.id },
      data: { chapterNumber: neighbor.chapterNumber },
    }),
  ]);

  return { movedChapterId: chapter.id };
};

const deleteChapter = async ({ chapterId, requester }) => {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { story: { select: { authorId: true } } },
  });
  if (!chapter) throw new Error("Không tìm thấy chương");

  ensureCanManageStory({ story: chapter.story, requester });

  await prisma.chapter.delete({ where: { id: chapter.id } });
  return { message: "Xóa chương thành công" };
};

module.exports = {
  createChapter,
  getChaptersByStory,
  getChapterDetail,
  updateChapter,
  moveChapter,
  deleteChapter,
};
