const prisma = require("../../config/prisma");
const notificationService = require("../notification/notification.service");
const { emitChapterComment } = require("../../realtime/socket");

const ALLOWED_CHAPTER_STATUSES = new Set(["draft", "published"]);

const normalizeText = (value) => String(value ?? "").trim();
const getRequesterDisplayName = (requester) =>
  normalizeText(
    requester?.displayName ||
      requester?.display_name ||
      requester?.email ||
      "Ai do",
  );

const formatChapter = (chapter) => ({
  id: chapter.id,
  story_id: chapter.storyId,
  chapter_number: chapter.chapterNumber,
  title: chapter.title,
  content: chapter.content,
  like_count: typeof chapter.stats?.likeCount === "number" ? chapter.stats.likeCount : 0,
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

const ensureChapterCanBeLiked = async ({ chapterId, requester }) => {
  const normalizedChapterId = normalizeText(chapterId);
  if (!normalizedChapterId) throw new Error("Thiáº¿u id chÆ°Æ¡ng");

  const chapter = await prisma.chapter.findUnique({
    where: { id: normalizedChapterId },
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
  if (!chapter) throw new Error("KhÃ´ng tÃ¬m tháº¥y chÆ°Æ¡ng");

  const isOwner = requester?.id && chapter.story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  const canViewDraft = Boolean(isOwner || isAdmin);

  if (chapter.story.status !== "published" && !canViewDraft) {
    throw new Error("Truyá»‡n chÆ°a Ä‘Æ°á»£c xuáº¥t báº£n");
  }

  if (chapter.status !== "published" && !canViewDraft) {
    throw new Error("ChÆ°Æ¡ng chÆ°a Ä‘Æ°á»£c xuáº¥t báº£n");
  }

  return chapter;
};

const ensureChapterCanBeCommented = async ({ chapterId, requester }) => {
  const normalizedChapterId = normalizeText(chapterId);
  if (!normalizedChapterId) throw new Error("Thiếu id chương");

  const chapter = await prisma.chapter.findUnique({
    where: { id: normalizedChapterId },
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

  if (chapter.story.status !== "published" && !canViewDraft) {
    throw new Error("Truyện chưa được xuất bản");
  }

  if (chapter.status !== "published" && !canViewDraft) {
    throw new Error("Chương chưa được xuất bản");
  }

  return chapter;
};

const formatChapterComment = (comment, requester) => ({
  id: comment.id,
  user_id: comment.userId,
  chapter_id: comment.chapterId,
  content: comment.content,
  like_count:
    typeof comment.stats?.likeCount === "number" ? comment.stats.likeCount : 0,
  is_edited: comment.isEdited,
  created_at: comment.createdAt,
  updated_at: comment.updatedAt,
  is_mine: Boolean(requester?.id && comment.userId === requester.id),
  is_liked: Array.isArray(comment.likes) ? comment.likes.length > 0 : false,
  user: {
    id: comment.user.id,
    display_name: comment.user.displayName,
    avatar_url: comment.user.avatarUrl,
    role: comment.user.role,
  },
});

const validateCommentContent = (content) => {
  const normalizedContent = normalizeText(content);
  if (!normalizedContent) throw new Error("Nội dung bình luận không được để trống");
  if (normalizedContent.length > 2000) {
    throw new Error("Nội dung bình luận tối đa 2000 ký tự");
  }
  return normalizedContent;
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
    include: {
      stats: {
        select: { likeCount: true, commentCount: true },
      },
      likes: requester?.id
        ? {
            where: { userId: requester.id },
            select: { id: true },
            take: 1,
          }
        : false,
    },
  });

  return chapters.map((chapter) => ({
    ...formatChapter(chapter),
    comment_count:
      typeof chapter.stats?.commentCount === "number"
        ? chapter.stats.commentCount
        : 0,
    is_liked: Array.isArray(chapter.likes) ? chapter.likes.length > 0 : false,
  }));
};

const getChapterDetail = async ({ chapterId, requester }) => {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      stats: {
        select: { likeCount: true, commentCount: true },
      },
      likes: requester?.id
        ? {
            where: { userId: requester.id },
            select: { id: true },
            take: 1,
          }
        : false,
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
    comment_count:
      typeof chapter.stats?.commentCount === "number"
        ? chapter.stats.commentCount
        : 0,
    is_liked: Array.isArray(chapter.likes) ? chapter.likes.length > 0 : false,
    story: {
      id: chapter.story.id,
      title: chapter.story.title,
      slug: chapter.story.slug,
      status: chapter.story.status,
    },
  };
};

const listChapterComments = async ({ chapterId, requester, sort, limit }) => {
  const chapter = await ensureChapterCanBeCommented({ chapterId, requester });
  const normalizedSort = normalizeText(sort).toLowerCase();

  let take = Number(limit);
  if (!Number.isInteger(take) || take <= 0) take = 20;
  take = Math.min(take, 100);

  const orderBy =
    normalizedSort === "oldest"
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : [{ createdAt: "desc" }, { id: "desc" }];

  const comments = await prisma.chapterComment.findMany({
    where: { chapterId: chapter.id },
    orderBy,
    take,
    include: {
      stats: {
        select: { likeCount: true },
      },
      likes: requester?.id
        ? {
            where: { userId: requester.id },
            select: { id: true },
            take: 1,
          }
        : false,
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          role: true,
        },
      },
    },
  });

  const commentCount = await prisma.chapterStat.findUnique({
    where: { chapterId: chapter.id },
    select: { commentCount: true },
  });

  return {
    chapter: {
      id: chapter.id,
      chapter_number: chapter.chapterNumber,
      title: chapter.title,
    },
    story: {
      id: chapter.story.id,
      title: chapter.story.title,
      slug: chapter.story.slug,
    },
    total: commentCount?.commentCount ?? comments.length,
    items: comments.map((comment) => formatChapterComment(comment, requester)),
  };
};

const ensureChapterCommentCanBeLiked = async ({ commentId, requester }) => {
  const normalizedCommentId = normalizeText(commentId);
  if (!normalizedCommentId) throw new Error("Thiếu id bình luận");

  const comment = await prisma.chapterComment.findUnique({
    where: { id: normalizedCommentId },
    include: {
      chapter: {
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
      },
    },
  });

  if (!comment) throw new Error("Không tìm thấy bình luận");

  const isOwner = requester?.id && comment.chapter.story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  const canViewDraft = Boolean(isOwner || isAdmin);

  if (comment.chapter.story.status !== "published" && !canViewDraft) {
    throw new Error("Truyện chưa được xuất bản");
  }

  if (comment.chapter.status !== "published" && !canViewDraft) {
    throw new Error("Chương chưa được xuất bản");
  }

  return comment;
};

const createChapterComment = async ({ chapterId, requester, content }) => {
  if (!requester?.id) throw new Error("Chưa đăng nhập");

  const chapter = await ensureChapterCanBeCommented({ chapterId, requester });
  const normalizedContent = validateCommentContent(content);

  const createdComment = await prisma.$transaction(async (tx) => {
    const comment = await tx.chapterComment.create({
      data: {
        userId: requester.id,
        chapterId: chapter.id,
        content: normalizedContent,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            role: true,
          },
        },
      },
    });

    await tx.chapterStat.upsert({
      where: { chapterId: chapter.id },
      create: {
        chapterId: chapter.id,
        likeCount: 0,
        commentCount: 1,
      },
      update: {
        commentCount: { increment: 1 },
      },
    });

    return comment;
  });

  const payload = formatChapterComment(createdComment, requester);
  emitChapterComment(chapter.id, payload);

  return payload;
};

const likeChapterComment = async ({ commentId, requester }) => {
  const comment = await ensureChapterCommentCanBeLiked({ commentId, requester });

  return prisma.$transaction(async (tx) => {
    const existed = await tx.chapterCommentLike.findUnique({
      where: {
        userId_commentId: {
          userId: requester.id,
          commentId: comment.id,
        },
      },
      select: { id: true },
    });

    if (existed) {
      const stats = await tx.chapterCommentStat.upsert({
        where: { commentId: comment.id },
        create: {
          commentId: comment.id,
          likeCount: 1,
        },
        update: {},
        select: { likeCount: true },
      });

      return {
        liked: true,
        like_count: stats.likeCount,
      };
    }

    await tx.chapterCommentLike.create({
      data: {
        userId: requester.id,
        commentId: comment.id,
      },
    });

    const stats = await tx.chapterCommentStat.upsert({
      where: { commentId: comment.id },
      create: {
        commentId: comment.id,
        likeCount: 1,
      },
      update: {
        likeCount: { increment: 1 },
      },
      select: { likeCount: true },
    });

    return {
      liked: true,
      like_count: stats.likeCount,
    };
  });
};

const unlikeChapterComment = async ({ commentId, requester }) => {
  const comment = await ensureChapterCommentCanBeLiked({ commentId, requester });

  return prisma.$transaction(async (tx) => {
    const existed = await tx.chapterCommentLike.findUnique({
      where: {
        userId_commentId: {
          userId: requester.id,
          commentId: comment.id,
        },
      },
      select: { id: true },
    });

    if (!existed) {
      const stats = await tx.chapterCommentStat.findUnique({
        where: { commentId: comment.id },
        select: { likeCount: true },
      });

      return {
        liked: false,
        like_count: stats?.likeCount ?? 0,
      };
    }

    await tx.chapterCommentLike.delete({
      where: {
        userId_commentId: {
          userId: requester.id,
          commentId: comment.id,
        },
      },
    });

    const currentStats = await tx.chapterCommentStat.findUnique({
      where: { commentId: comment.id },
      select: { likeCount: true },
    });

    if (!currentStats) {
      return {
        liked: false,
        like_count: 0,
      };
    }

    const updatedStats = await tx.chapterCommentStat.update({
      where: { commentId: comment.id },
      data: { likeCount: Math.max(0, currentStats.likeCount - 1) },
      select: { likeCount: true },
    });

    return {
      liked: false,
      like_count: updatedStats.likeCount,
    };
  });
};

const likeChapter = async ({ chapterId, requester }) => {
  const chapter = await ensureChapterCanBeLiked({ chapterId, requester });

  const result = await prisma.$transaction(async (tx) => {
    const existed = await tx.chapterLike.findUnique({
      where: {
        userId_chapterId: {
          userId: requester.id,
          chapterId: chapter.id,
        },
      },
      select: { id: true },
    });

    if (existed) {
      const stats = await tx.chapterStat.upsert({
        where: { chapterId: chapter.id },
        create: {
          chapterId: chapter.id,
          likeCount: 1,
        },
        update: {},
        select: { likeCount: true },
      });

      return {
        liked: true,
        like_count: stats.likeCount,
        should_notify: false,
      };
    }

    await tx.chapterLike.create({
      data: {
        userId: requester.id,
        chapterId: chapter.id,
      },
    });

    const stats = await tx.chapterStat.upsert({
      where: { chapterId: chapter.id },
      create: {
        chapterId: chapter.id,
        likeCount: 1,
      },
      update: {
        likeCount: { increment: 1 },
      },
      select: { likeCount: true },
    });

    return {
      liked: true,
      like_count: stats.likeCount,
      should_notify: true,
    };
  });

  if (result.should_notify && requester.id !== chapter.story.authorId) {
    await notificationService.createNotification({
      recipientId: chapter.story.authorId,
      actorId: requester.id,
      storyId: chapter.story.id,
      chapterId: chapter.id,
      type: "chapter_liked",
      title: `${getRequesterDisplayName(requester)} đã thích chương ${chapter.chapterNumber} của truyện ${chapter.story.title}`,
      body: chapter.title,
      linkUrl: `/stories/${chapter.story.slug}/chapters/${chapter.id}`,
      meta: {
        story_title: chapter.story.title,
        chapter_number: chapter.chapterNumber,
        chapter_title: chapter.title,
      },
    });
  }

  return {
    liked: result.liked,
    like_count: result.like_count,
  };
};

const unlikeChapter = async ({ chapterId, requester }) => {
  const chapter = await ensureChapterCanBeLiked({ chapterId, requester });

  return prisma.$transaction(async (tx) => {
    const existed = await tx.chapterLike.findUnique({
      where: {
        userId_chapterId: {
          userId: requester.id,
          chapterId: chapter.id,
        },
      },
      select: { id: true },
    });

    if (!existed) {
      const stats = await tx.chapterStat.findUnique({
        where: { chapterId: chapter.id },
        select: { likeCount: true },
      });

      return {
        liked: false,
        like_count: stats?.likeCount ?? 0,
      };
    }

    await tx.chapterLike.delete({
      where: {
        userId_chapterId: {
          userId: requester.id,
          chapterId: chapter.id,
        },
      },
    });

    const currentStats = await tx.chapterStat.findUnique({
      where: { chapterId: chapter.id },
      select: { likeCount: true },
    });

    if (!currentStats) {
      return {
        liked: false,
        like_count: 0,
      };
    }

    const updatedStats = await tx.chapterStat.update({
      where: { chapterId: chapter.id },
      data: { likeCount: Math.max(0, currentStats.likeCount - 1) },
      select: { likeCount: true },
    });

    return {
      liked: false,
      like_count: updatedStats.likeCount,
    };
  });
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
  likeChapter,
  unlikeChapter,
  listChapterComments,
  createChapterComment,
  likeChapterComment,
  unlikeChapterComment,
  updateChapter,
  moveChapter,
  deleteChapter,
};
