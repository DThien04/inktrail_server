const prisma = require("../../config/prisma");
const notificationService = require("../notification/notification.service");
const { emitChapterComment } = require("../../realtime/socket");
const {
  recomputeChapterFeaturedComment,
  getChapterFeaturedCommentId,
} = require("../comment/comment-featured.service");

const ALLOWED_CHAPTER_STATUSES = new Set(["draft", "published"]);
const CHAPTER_COMMENT_NOTIFICATION_TYPE = "chapter_commented";

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
    throw new Error("Báº¡n khÃ´ng cÃ³ quyá»n thao tÃ¡c chÆ°Æ¡ng cá»§a truyá»‡n nÃ y");
  }
};

const parseChapterNumber = (value) => {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error("chapter_number pháº£i lÃ  sá»‘ nguyÃªn dÆ°Æ¡ng");
  }
  return num;
};

const normalizeStatus = (value, fallback = "draft") => {
  const normalized = normalizeText(value) || fallback;
  if (!ALLOWED_CHAPTER_STATUSES.has(normalized)) {
    throw new Error("Tráº¡ng thÃ¡i chÆ°Æ¡ng khÃ´ng há»£p lá»‡");
  }
  return normalized;
};

const normalizeMoveDirection = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized !== "up" && normalized !== "down") {
    throw new Error("direction pháº£i lÃ  up hoáº·c down");
  }
  return normalized;
};

const ensureChapterCanBeLiked = async ({ chapterId, requester }) => {
  const normalizedChapterId = normalizeText(chapterId);
  if (!normalizedChapterId) throw new Error("ThiÃ¡ÂºÂ¿u id chÃ†Â°Ã†Â¡ng");

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
  if (!chapter) throw new Error("KhÃƒÂ´ng tÃƒÂ¬m thÃ¡ÂºÂ¥y chÃ†Â°Ã†Â¡ng");

  const isOwner = requester?.id && chapter.story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  const canViewDraft = Boolean(isOwner || isAdmin);

  if (chapter.story.status !== "published" && !canViewDraft) {
    throw new Error("TruyÃ¡Â»â€¡n chÃ†Â°a Ã„â€˜Ã†Â°Ã¡Â»Â£c xuÃ¡ÂºÂ¥t bÃ¡ÂºÂ£n");
  }

  if (chapter.status !== "published" && !canViewDraft) {
    throw new Error("ChÃ†Â°Ã†Â¡ng chÃ†Â°a Ã„â€˜Ã†Â°Ã¡Â»Â£c xuÃ¡ÂºÂ¥t bÃ¡ÂºÂ£n");
  }

  return chapter;
};

const ensureChapterCanBeCommented = async ({ chapterId, requester }) => {
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

const formatChapterComment = (comment, requester, featuredCommentId = null) => ({
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
  is_highlighted: featuredCommentId === comment.id,
  user: {
    id: comment.user.id,
    display_name: comment.user.displayName,
    avatar_url: comment.user.avatarUrl,
    role: comment.user.role,
  },
});

const validateCommentContent = (content) => {
  const normalizedContent = normalizeText(content);
  if (!normalizedContent) throw new Error("Ná»™i dung bÃ¬nh luáº­n khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng");
  if (normalizedContent.length > 2000) {
    throw new Error("Ná»™i dung bÃ¬nh luáº­n tá»‘i Ä‘a 2000 kÃ½ tá»±");
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
  if (!story) throw new Error("KhÃ´ng tÃ¬m tháº¥y truyá»‡n");

  ensureCanManageStory({ story, requester });

  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) throw new Error("TiÃªu Ä‘á» chÆ°Æ¡ng khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng");
  if (normalizedTitle.length > 255) throw new Error("TiÃªu Ä‘á» chÆ°Æ¡ng tá»‘i Ä‘a 255 kÃ½ tá»±");

  const normalizedContent = normalizeText(content);
  if (!normalizedContent) throw new Error("Ná»™i dung chÆ°Æ¡ng khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng");

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
  if (existed) throw new Error("Sá»‘ chÆ°Æ¡ng Ä‘Ã£ tá»“n táº¡i trong truyá»‡n nÃ y");

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
  if (!story) throw new Error("KhÃ´ng tÃ¬m tháº¥y truyá»‡n");

  const isOwner = requester?.id && story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  const canViewDraft = Boolean(isOwner || isAdmin);
  if (story.status !== "published" && !canViewDraft) {
    throw new Error("Truyện chưa được xuất bản");
  }

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
  if (!chapter) throw new Error("KhÃ´ng tÃ¬m tháº¥y chÆ°Æ¡ng");

  const isOwner = requester?.id && chapter.story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  const canViewDraft = Boolean(isOwner || isAdmin);
  if (chapter.status !== "published" && !canViewDraft) {
    throw new Error("ChÆ°Æ¡ng chÆ°a Ä‘Æ°á»£c xuáº¥t báº£n");
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
  const featuredCommentId = await getChapterFeaturedCommentId({ chapterId: chapter.id });

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
    featured_comment_id: featuredCommentId,
    items: comments.map((comment) =>
      formatChapterComment(comment, requester, featuredCommentId),
    ),
  };
};

const ensureChapterCommentCanBeLiked = async ({ commentId, requester }) => {
  const normalizedCommentId = normalizeText(commentId);
  if (!normalizedCommentId) throw new Error("Thiáº¿u id bÃ¬nh luáº­n");

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

  if (!comment) throw new Error("KhÃ´ng tÃ¬m tháº¥y bÃ¬nh luáº­n");

  const isOwner = requester?.id && comment.chapter.story.authorId === requester.id;
  const isAdmin = requester?.role === "admin";
  const canViewDraft = Boolean(isOwner || isAdmin);

  if (comment.chapter.story.status !== "published" && !canViewDraft) {
    throw new Error("Truyá»‡n chÆ°a Ä‘Æ°á»£c xuáº¥t báº£n");
  }

  if (comment.chapter.status !== "published" && !canViewDraft) {
    throw new Error("ChÆ°Æ¡ng chÆ°a Ä‘Æ°á»£c xuáº¥t báº£n");
  }

  return comment;
};

const ensureChapterCommentCanBeManaged = async ({ commentId, requester }) => {
  if (!requester?.id) throw new Error("Chua dang nhap");

  const normalizedCommentId = normalizeText(commentId);
  if (!normalizedCommentId) throw new Error("Thieu id binh luan");

  const comment = await prisma.chapterComment.findUnique({
    where: { id: normalizedCommentId },
    include: {
      chapter: {
        include: {
          story: {
            select: {
              id: true,
              authorId: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          role: true,
        },
      },
      stats: {
        select: { likeCount: true },
      },
      likes: {
        where: { userId: requester.id },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!comment) throw new Error("Khong tim thay binh luan");

  const isCommentOwner = comment.userId === requester.id;
  const isStoryOwner = comment.chapter.story.authorId === requester.id;
  const isAdmin = requester.role === "admin";
  if (!isCommentOwner && !isStoryOwner && !isAdmin) {
    throw new Error("Ban khong co quyen thao tac binh luan nay");
  }

  return comment;
};

const createChapterComment = async ({ chapterId, requester, content }) => {
  if (!requester?.id) throw new Error("ChÆ°a Ä‘Äƒng nháº­p");

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
    await recomputeChapterFeaturedComment({ tx, chapterId: chapter.id });

    return comment;
  });

  const payload = formatChapterComment(createdComment, requester);
  emitChapterComment(chapter.id, payload);

  if (requester.id !== chapter.story.authorId) {
    await notificationService.createNotification({
      recipientId: chapter.story.authorId,
      actorId: requester.id,
      storyId: chapter.story.id,
      chapterId: chapter.id,
      type: CHAPTER_COMMENT_NOTIFICATION_TYPE,
      title: `${getRequesterDisplayName(requester)} da binh luan chuong ${chapter.chapterNumber} cua truyen ${chapter.story.title}`,
      body: normalizedContent,
      linkUrl: `/stories/${chapter.story.slug}/chapters/${chapter.id}`,
      meta: {
        story_title: chapter.story.title,
        chapter_number: chapter.chapterNumber,
        chapter_title: chapter.title,
        comment_preview: normalizedContent.slice(0, 120),
      },
    });
  }

  return payload;
};

const likeChapterComment = async ({ commentId, requester }) => {
  const comment = await ensureChapterCommentCanBeLiked({ commentId, requester });

  const result = await prisma.$transaction(async (tx) => {
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
      await recomputeChapterFeaturedComment({ tx, chapterId: comment.chapterId });

      return {
        liked: true,
        like_count: stats.likeCount,
        should_notify: false,
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
    await recomputeChapterFeaturedComment({ tx, chapterId: comment.chapterId });

    return {
      liked: true,
      like_count: stats.likeCount,
      should_notify: requester.id !== comment.userId,
    };
  });

  if (result.should_notify) {
    await notificationService.createNotification({
      recipientId: comment.userId,
      actorId: requester.id,
      storyId: comment.chapter.story.id,
      chapterId: comment.chapter.id,
      type: "system",
      title: `${getRequesterDisplayName(requester)} da thich binh luan cua ban`,
      body: comment.content,
      linkUrl: `/stories/${comment.chapter.story.slug}/chapters/${comment.chapter.id}`,
      meta: {
        story_title: comment.chapter.story.title,
        chapter_number: comment.chapter.chapterNumber,
        chapter_title: comment.chapter.title,
        comment_id: comment.id,
        comment_preview: String(comment.content || "").slice(0, 120),
      },
    });
  }

  return {
    liked: result.liked,
    like_count: result.like_count,
  };
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
    await recomputeChapterFeaturedComment({ tx, chapterId: comment.chapterId });

    return {
      liked: false,
      like_count: updatedStats.likeCount,
    };
  });
};

const updateChapterComment = async ({ commentId, requester, content }) => {
  const comment = await ensureChapterCommentCanBeManaged({ commentId, requester });
  const normalizedContent = validateCommentContent(content);

  const updatedComment = await prisma.$transaction(async (tx) => {
    const updated = await tx.chapterComment.update({
      where: { id: comment.id },
      data: {
        content: normalizedContent,
        isEdited: true,
      },
      include: {
        stats: {
          select: { likeCount: true },
        },
        likes: {
          where: { userId: requester.id },
          select: { id: true },
          take: 1,
        },
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

    await recomputeChapterFeaturedComment({ tx, chapterId: comment.chapterId });
    return updated;
  });

  const featuredCommentId = await getChapterFeaturedCommentId({
    chapterId: comment.chapterId,
  });
  return formatChapterComment(updatedComment, requester, featuredCommentId);
};

const deleteChapterComment = async ({ commentId, requester }) => {
  const comment = await ensureChapterCommentCanBeManaged({ commentId, requester });

  return prisma.$transaction(async (tx) => {
    await tx.chapterComment.delete({
      where: { id: comment.id },
    });

    const currentStats = await tx.chapterStat.findUnique({
      where: { chapterId: comment.chapterId },
      select: { commentCount: true },
    });

    let nextCommentCount = 0;
    if (currentStats) {
      nextCommentCount = Math.max(0, currentStats.commentCount - 1);
      await tx.chapterStat.update({
        where: { chapterId: comment.chapterId },
        data: { commentCount: nextCommentCount },
      });
    }

    await recomputeChapterFeaturedComment({ tx, chapterId: comment.chapterId });

    return {
      deleted: true,
      comment_id: comment.id,
      chapter_id: comment.chapterId,
      comment_count: nextCommentCount,
    };
  });
};

const getChapterFeaturedComment = async ({ chapterId, requester }) => {
  const chapter = await ensureChapterCanBeCommented({ chapterId, requester });
  const featuredCommentId = await getChapterFeaturedCommentId({ chapterId: chapter.id });

  if (!featuredCommentId) {
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
      featured_comment_id: null,
      item: null,
    };
  }

  const comment = await prisma.chapterComment.findUnique({
    where: { id: featuredCommentId },
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
    featured_comment_id: featuredCommentId,
    item: comment
      ? formatChapterComment(comment, requester, featuredCommentId)
      : null,
  };
};

const recomputeChapterFeaturedByChapterId = async ({ chapterId, requester }) => {
  const normalizedChapterId = normalizeText(chapterId);
  if (!normalizedChapterId) throw new Error("Thiáº¿u id chÆ°Æ¡ng");

  const chapter = await prisma.chapter.findUnique({
    where: { id: normalizedChapterId },
    include: {
      story: {
        select: { id: true, title: true, slug: true, authorId: true },
      },
    },
  });
  if (!chapter) throw new Error("KhÃ´ng tÃ¬m tháº¥y chÆ°Æ¡ng");
  ensureCanManageStory({ story: chapter.story, requester });

  const featuredCommentId = await prisma.$transaction((tx) =>
    recomputeChapterFeaturedComment({ tx, chapterId: chapter.id }),
  );

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
    featured_comment_id: featuredCommentId,
  };
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
      title: `${getRequesterDisplayName(requester)} Ä‘Ã£ thÃ­ch chÆ°Æ¡ng ${chapter.chapterNumber} cá»§a truyá»‡n ${chapter.story.title}`,
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
  if (!chapter) throw new Error("KhÃ´ng tÃ¬m tháº¥y chÆ°Æ¡ng");

  ensureCanManageStory({ story: chapter.story, requester });

  const data = {};

  if (title !== undefined) {
    const normalizedTitle = normalizeText(title);
    if (!normalizedTitle) throw new Error("TiÃªu Ä‘á» chÆ°Æ¡ng khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng");
    if (normalizedTitle.length > 255) {
      throw new Error("TiÃªu Ä‘á» chÆ°Æ¡ng tá»‘i Ä‘a 255 kÃ½ tá»±");
    }
    data.title = normalizedTitle;
  }

  if (content !== undefined) {
    const normalizedContent = normalizeText(content);
    if (!normalizedContent) throw new Error("Ná»™i dung chÆ°Æ¡ng khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng");
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
      throw new Error("Sá»‘ chÆ°Æ¡ng Ä‘Ã£ tá»“n táº¡i trong truyá»‡n nÃ y");
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
    throw new Error("KhÃ´ng cÃ³ dá»¯ liá»‡u há»£p lá»‡ Ä‘á»ƒ cáº­p nháº­t");
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
  if (!chapter) throw new Error("KhÃ´ng tÃ¬m tháº¥y chÆ°Æ¡ng");

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
        ? "ChÆ°Æ¡ng nÃ y Ä‘Ã£ á»Ÿ Ä‘áº§u danh sÃ¡ch"
        : "ChÆ°Æ¡ng nÃ y Ä‘Ã£ á»Ÿ cuá»‘i danh sÃ¡ch",
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
  if (!chapter) throw new Error("KhÃ´ng tÃ¬m tháº¥y chÆ°Æ¡ng");

  ensureCanManageStory({ story: chapter.story, requester });

  await prisma.chapter.delete({ where: { id: chapter.id } });
  return { message: "XÃ³a chÆ°Æ¡ng thÃ nh cÃ´ng" };
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
  updateChapterComment,
  deleteChapterComment,
  getChapterFeaturedComment,
  recomputeChapterFeaturedByChapterId,
  updateChapter,
  moveChapter,
  deleteChapter,
};

