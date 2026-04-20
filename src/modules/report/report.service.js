const prisma = require("../../config/prisma");

const ALLOWED_COMMENT_REPORT_REASONS = new Set([
  "spam",
  "abuse",
  "hate",
  "sexual",
  "violence",
  "other",
]);
const ALLOWED_CONTENT_REPORT_REASONS = new Set([
  "spam",
  "copyright",
  "sexual",
  "violence",
  "hate",
  "misleading",
  "other",
]);

const normalizeText = (value) => String(value ?? "").trim();
const isAdmin = (requester) => requester?.role === "admin";

const validateCommentReportReason = (reason) => {
  const normalizedReason = normalizeText(reason).toLowerCase();
  if (!ALLOWED_COMMENT_REPORT_REASONS.has(normalizedReason)) {
    throw new Error("Ly do bao cao khong hop le");
  }
  return normalizedReason;
};

const validateContentReportReason = (reason) => {
  const normalizedReason = normalizeText(reason).toLowerCase();
  if (!ALLOWED_CONTENT_REPORT_REASONS.has(normalizedReason)) {
    throw new Error("Ly do bao cao khong hop le");
  }
  return normalizedReason;
};

const validateCommentReportDescription = (description) => {
  const normalizedDescription = normalizeText(description);
  if (!normalizedDescription) return null;
  if (normalizedDescription.length > 500) {
    throw new Error("Mo ta bao cao toi da 500 ky tu");
  }
  return normalizedDescription;
};

const validateContentReportDescription = (description) => {
  const normalizedDescription = normalizeText(description);
  if (!normalizedDescription) {
    throw new Error("Vui long nhap mo ta bao cao");
  }
  if (normalizedDescription.length > 500) {
    throw new Error("Mo ta bao cao toi da 500 ky tu");
  }
  return normalizedDescription;
};

const ensureChapterCommentCanBeReported = async ({ commentId, requester }) => {
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

  if (!comment) throw new Error("Khong tim thay binh luan");

  const isStoryOwner = comment.chapter.story.authorId === requester.id;
  const canViewDraft = Boolean(isStoryOwner || isAdmin(requester));

  if (comment.chapter.story.status !== "published" && !canViewDraft) {
    throw new Error("Truyen chua duoc xuat ban");
  }

  if (comment.chapter.status !== "published" && !canViewDraft) {
    throw new Error("Chuong chua duoc xuat ban");
  }

  return comment;
};

const ensureStoryCanBeReported = async ({ storyId, requester }) => {
  if (!requester?.id) throw new Error("Chua dang nhap");

  const normalizedStoryId = normalizeText(storyId);
  if (!normalizedStoryId) throw new Error("Thieu id truyen");

  const story = await prisma.story.findUnique({
    where: { id: normalizedStoryId },
    select: {
      id: true,
      title: true,
      slug: true,
      authorId: true,
      status: true,
    },
  });

  if (!story) throw new Error("Khong tim thay truyen");

  const canViewDraft = story.authorId === requester.id || isAdmin(requester);
  if (story.status !== "published" && !canViewDraft) {
    throw new Error("Truyen chua duoc xuat ban");
  }

  return story;
};

const ensureChapterCanBeReported = async ({ chapterId, requester }) => {
  if (!requester?.id) throw new Error("Chua dang nhap");

  const normalizedChapterId = normalizeText(chapterId);
  if (!normalizedChapterId) throw new Error("Thieu id chuong");

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

  if (!chapter) throw new Error("Khong tim thay chuong");

  const canViewDraft = chapter.story.authorId === requester.id || isAdmin(requester);
  if (chapter.story.status !== "published" && !canViewDraft) {
    throw new Error("Truyen chua duoc xuat ban");
  }
  if (chapter.status !== "published" && !canViewDraft) {
    throw new Error("Chuong chua duoc xuat ban");
  }

  return chapter;
};

const reportChapterComment = async ({ commentId, requester, reason, description }) => {
  const comment = await ensureChapterCommentCanBeReported({ commentId, requester });
  if (comment.userId === requester.id) {
    throw new Error("Ban khong the bao cao binh luan cua chinh minh");
  }

  const normalizedReason = validateCommentReportReason(reason);
  const normalizedDescription = validateCommentReportDescription(description);

  const existingReport = await prisma.chapterCommentReport.findUnique({
    where: {
      reporterId_commentId: {
        reporterId: requester.id,
        commentId: comment.id,
      },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
  });

  if (existingReport) {
    return {
      reported: true,
      already_reported: true,
      report_id: existingReport.id,
      status: existingReport.status,
      created_at: existingReport.createdAt,
      message: "Ban da bao cao binh luan nay roi",
    };
  }

  const report = await prisma.chapterCommentReport.create({
    data: {
      reporterId: requester.id,
      commentId: comment.id,
      reason: normalizedReason,
      description: normalizedDescription,
      status: "pending",
    },
    select: {
      id: true,
      reason: true,
      status: true,
      createdAt: true,
    },
  });

  return {
    reported: true,
    already_reported: false,
    report_id: report.id,
    reason: report.reason,
    status: report.status,
    created_at: report.createdAt,
    message: "Bao cao binh luan thanh cong",
  };
};

const reportStory = async ({ storyId, requester, reason, description }) => {
  const story = await ensureStoryCanBeReported({ storyId, requester });
  if (story.authorId === requester.id) {
    throw new Error("Ban khong the bao cao truyen cua chinh minh");
  }

  const normalizedReason = validateContentReportReason(reason);
  const normalizedDescription = validateContentReportDescription(description);

  const existingReport = await prisma.storyReport.findUnique({
    where: {
      reporterId_storyId: {
        reporterId: requester.id,
        storyId: story.id,
      },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
  });

  if (existingReport) {
    return {
      reported: true,
      already_reported: true,
      report_id: existingReport.id,
      status: existingReport.status,
      created_at: existingReport.createdAt,
      message: "Ban da bao cao truyen nay roi",
    };
  }

  const report = await prisma.storyReport.create({
    data: {
      reporterId: requester.id,
      storyId: story.id,
      reason: normalizedReason,
      description: normalizedDescription,
      status: "pending",
    },
    select: {
      id: true,
      reason: true,
      status: true,
      createdAt: true,
    },
  });

  return {
    reported: true,
    already_reported: false,
    report_id: report.id,
    reason: report.reason,
    status: report.status,
    created_at: report.createdAt,
    message: "Bao cao truyen thanh cong",
  };
};

const reportChapter = async ({ chapterId, requester, reason, description }) => {
  const chapter = await ensureChapterCanBeReported({ chapterId, requester });
  if (chapter.story.authorId === requester.id) {
    throw new Error("Ban khong the bao cao chuong cua chinh minh");
  }

  const normalizedReason = validateContentReportReason(reason);
  const normalizedDescription = validateContentReportDescription(description);

  const existingReport = await prisma.chapterReport.findUnique({
    where: {
      reporterId_chapterId: {
        reporterId: requester.id,
        chapterId: chapter.id,
      },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
  });

  if (existingReport) {
    return {
      reported: true,
      already_reported: true,
      report_id: existingReport.id,
      status: existingReport.status,
      created_at: existingReport.createdAt,
      message: "Ban da bao cao chuong nay roi",
    };
  }

  const report = await prisma.chapterReport.create({
    data: {
      reporterId: requester.id,
      chapterId: chapter.id,
      reason: normalizedReason,
      description: normalizedDescription,
      status: "pending",
    },
    select: {
      id: true,
      reason: true,
      status: true,
      createdAt: true,
    },
  });

  return {
    reported: true,
    already_reported: false,
    report_id: report.id,
    reason: report.reason,
    status: report.status,
    created_at: report.createdAt,
    message: "Bao cao chuong thanh cong",
  };
};

module.exports = {
  reportStory,
  reportChapter,
  reportChapterComment,
};
