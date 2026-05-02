const prisma = require("../../config/prisma");
const notificationService = require("../notification/notification.service");
const {
  recomputeChapterFeaturedComment,
} = require("../comment/comment-featured.service");
const {
  analyzeReportCaseAi,
  analyzeReportCaseAppealAi,
} = require("./report-ai.service");
const {
  calculateReportCaseRisk,
  deriveReportCasePriority,
} = require("./report-case-scoring");

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
const ADMIN_REPORT_TYPES = new Set([
  "story",
  "chapter",
  "chapter_comment",
]);
const CONTENT_REPORT_STATUSES = new Set([
  "pending",
  "dismissed",
  "action_taken",
]);
const COMMENT_REPORT_STATUSES = new Set([
  "pending",
  "dismissed",
  "removed",
]);
const REPORT_AI_MAX_ATTEMPTS = 2;
const REPORT_AI_RETRY_DELAY_MS = 5000;

const normalizeText = (value) => String(value ?? "").trim();
const isAdmin = (requester) => requester?.role === "admin";

const buildReportTargetLink = ({ type, storySlug, chapterId }) => {
  if (type === "story" && storySlug) return `/stories/${storySlug}`;
  if (storySlug && chapterId) return `/stories/${storySlug}/chapters/${chapterId}`;
  return null;
};

const summarizeReportAiForUser = (reportCase) => {
  const summary = normalizeText(reportCase?.aiSummary);
  if (summary) return summary;
  return "AI đã xem báo cáo của bạn và ghi nhận để hỗ trợ ưu tiên xử lý.";
};

const summarizeAppealAiForUser = (reportCase) => {
  const summary = normalizeText(reportCase?.appealAiSummary);
  if (summary) return summary;
  return "AI đã xem kháng nghị của bạn và chuyển kết quả để admin tham khảo.";
};

const scheduleReportCaseAiAnalysis = ({
  type,
  caseId,
  recipientId,
  storyId,
  chapterId,
  storySlug,
  attempt = 1,
}) => {
  setTimeout(async () => {
    try {
      const analyzed = await analyzeReportCaseAi({ type, caseId });
      if (!analyzed || !recipientId) return;

      await notificationService.createNotification({
        recipientId,
        actorId: null,
        storyId: storyId ?? null,
        chapterId: chapterId ?? null,
        type: "admin_message",
        title: "AI đã xem báo cáo của bạn",
        body: summarizeReportAiForUser(analyzed),
        linkUrl: buildReportTargetLink({ type, storySlug, chapterId }),
        meta: {
          case_id: analyzed.id,
          audience: "reporter",
          report_type: type,
          resolution_action: "report_ai_analyzed",
          ai_checked_at: analyzed.aiCheckedAt ?? null,
          ai_flagged: Boolean(analyzed.aiFlagged),
          ai_suggested_action: analyzed.aiSuggestedAction ?? null,
        },
      });
    } catch (error) {
      console.error(
        "[report-ai-background:error]",
        JSON.stringify({
          case_id: caseId,
          report_type: type,
          attempt,
          message: error?.message || String(error),
        }),
      );
      if (attempt < REPORT_AI_MAX_ATTEMPTS) {
        scheduleReportCaseAiAnalysis({
          type,
          caseId,
          recipientId,
          storyId,
          chapterId,
          storySlug,
          attempt: attempt + 1,
        });
      }
    }
  }, attempt === 1 ? 0 : REPORT_AI_RETRY_DELAY_MS);
};

const scheduleReportAppealAiAnalysis = ({
  caseId,
  recipientId,
  storyId,
  chapterId,
  storySlug,
  reportType,
  attempt = 1,
}) => {
  setTimeout(async () => {
    try {
      const analyzed = await analyzeReportCaseAppealAi({ caseId });
      if (!analyzed || !recipientId) return;

      await notificationService.createNotification({
        recipientId,
        actorId: null,
        storyId: storyId ?? null,
        chapterId: chapterId ?? null,
        type: "admin_message",
        title: "AI đã xem kháng nghị của bạn",
        body: summarizeAppealAiForUser(analyzed),
        linkUrl: buildReportTargetLink({
          type: reportType,
          storySlug,
          chapterId,
        }),
        meta: {
          case_id: analyzed.id,
          audience: "owner",
          report_type: reportType,
          resolution_action: "appeal_ai_analyzed",
          appeal_ai_checked_at: analyzed.appealAiCheckedAt ?? null,
          appeal_ai_recommendation: analyzed.appealAiRecommendation ?? null,
        },
      });
    } catch (error) {
      console.error(
        "[appeal-ai-background:error]",
        JSON.stringify({
          case_id: caseId,
          attempt,
          message: error?.message || String(error),
        }),
      );
      if (attempt < REPORT_AI_MAX_ATTEMPTS) {
        scheduleReportAppealAiAnalysis({
          caseId,
          recipientId,
          storyId,
          chapterId,
          storySlug,
          reportType,
          attempt: attempt + 1,
        });
      }
    }
  }, attempt === 1 ? 0 : REPORT_AI_RETRY_DELAY_MS);
};

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

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const getRequesterDisplayName = (requester) =>
  normalizeText(
    requester?.displayName ||
      requester?.display_name ||
      requester?.email ||
      "Quản trị viên",
  );

const validateAdminReportType = (type) => {
  const normalizedType = normalizeText(type).toLowerCase();
  if (!ADMIN_REPORT_TYPES.has(normalizedType)) {
    throw new Error("Loai bao cao khong hop le");
  }
  return normalizedType;
};

const validateAdminReportStatus = ({ type, status }) => {
  const normalizedStatus = normalizeText(status).toLowerCase();
  if (!normalizedStatus) return null;

  const allowedStatuses =
    type === "chapter_comment"
      ? COMMENT_REPORT_STATUSES
      : CONTENT_REPORT_STATUSES;

  if (!allowedStatuses.has(normalizedStatus)) {
    throw new Error("Trang thai bao cao khong hop le");
  }
  return normalizedStatus;
};

const buildReportSummary = ({ type, report }) => {
  const reporter = report.reporter ?? {};

  if (type === "story") {
    const story = report.story ?? {};
    return {
      id: report.id,
      case_id: report.reportCase?.id ?? null,
      case_status: report.reportCase?.status ?? null,
      case_resolution_action: report.reportCase?.resolutionAction ?? null,
      case_last_resolution_action:
        report.reportCase?.lastResolutionAction ?? null,
      case_report_count: report.reportCase?.reportCount ?? null,
      case_unique_reporter_count: report.reportCase?.uniqueReporterCount ?? null,
      case_risk_score: report.reportCase?.riskScore ?? null,
      case_priority: report.reportCase?.priority ?? null,
      case_reopened_count: report.reportCase?.reopenedCount ?? null,
      case_last_reported_at: report.reportCase?.lastReportedAt ?? null,
      case_restored_at: report.reportCase?.restoredAt ?? null,
      case_restored_by_id: report.reportCase?.restoredById ?? null,
      case_ai_flagged: report.reportCase?.aiFlagged ?? false,
      case_ai_categories: report.reportCase?.aiCategories ?? null,
      case_ai_confidence: report.reportCase?.aiConfidence ?? null,
      case_ai_severity: report.reportCase?.aiSeverity ?? null,
      case_ai_summary: report.reportCase?.aiSummary ?? null,
      case_ai_suggested_action: report.reportCase?.aiSuggestedAction ?? null,
      case_ai_checked_at: report.reportCase?.aiCheckedAt ?? null,
      case_appeal_status: report.reportCase?.appealStatus ?? null,
      case_appeal_reason: report.reportCase?.appealReason ?? null,
      case_appeal_submitted_at: report.reportCase?.appealSubmittedAt ?? null,
      case_appeal_resolved_at: report.reportCase?.appealResolvedAt ?? null,
      case_appeal_resolved_by_id:
        report.reportCase?.appealResolvedById ?? null,
      case_appeal_ai_summary: report.reportCase?.appealAiSummary ?? null,
      case_appeal_ai_recommendation:
        report.reportCase?.appealAiRecommendation ?? null,
      case_appeal_ai_confidence:
        report.reportCase?.appealAiConfidence ?? null,
      case_appeal_ai_checked_at: report.reportCase?.appealAiCheckedAt ?? null,
      type,
      reason: report.reason,
      description: report.description,
      status: report.status,
      created_at: report.createdAt,
      updated_at: report.updatedAt,
      resolved_at: report.resolvedAt,
      reporter: {
        id: reporter.id,
        display_name: reporter.displayName,
        email: reporter.email,
      },
      target: {
        id: story.id,
        title: story.title,
        slug: story.slug,
        description: story.description,
        cover_url: story.coverUrl,
        status: story.status,
        is_hidden: Boolean(story.isHidden),
        hidden_at: story.hiddenAt ?? null,
        genres: Array.isArray(story.storyGenres)
          ? story.storyGenres
              .map((item) => item.genre)
              .filter(Boolean)
              .map((genre) => ({
                id: genre.id,
                name: genre.name,
                slug: genre.slug,
              }))
          : [],
        author: story.author
            ? {
                id: story.author.id,
                display_name: story.author.displayName,
                email: story.author.email,
              }
            : null,
      },
    };
  }

  if (type === "chapter") {
    const chapter = report.chapter ?? {};
    const story = chapter.story ?? {};
    return {
      id: report.id,
      case_id: report.reportCase?.id ?? null,
      case_status: report.reportCase?.status ?? null,
      case_resolution_action: report.reportCase?.resolutionAction ?? null,
      case_last_resolution_action:
        report.reportCase?.lastResolutionAction ?? null,
      case_report_count: report.reportCase?.reportCount ?? null,
      case_unique_reporter_count: report.reportCase?.uniqueReporterCount ?? null,
      case_risk_score: report.reportCase?.riskScore ?? null,
      case_priority: report.reportCase?.priority ?? null,
      case_reopened_count: report.reportCase?.reopenedCount ?? null,
      case_last_reported_at: report.reportCase?.lastReportedAt ?? null,
      case_restored_at: report.reportCase?.restoredAt ?? null,
      case_restored_by_id: report.reportCase?.restoredById ?? null,
      case_ai_flagged: report.reportCase?.aiFlagged ?? false,
      case_ai_categories: report.reportCase?.aiCategories ?? null,
      case_ai_confidence: report.reportCase?.aiConfidence ?? null,
      case_ai_severity: report.reportCase?.aiSeverity ?? null,
      case_ai_summary: report.reportCase?.aiSummary ?? null,
      case_ai_suggested_action: report.reportCase?.aiSuggestedAction ?? null,
      case_ai_checked_at: report.reportCase?.aiCheckedAt ?? null,
      case_appeal_status: report.reportCase?.appealStatus ?? null,
      case_appeal_reason: report.reportCase?.appealReason ?? null,
      case_appeal_submitted_at: report.reportCase?.appealSubmittedAt ?? null,
      case_appeal_resolved_at: report.reportCase?.appealResolvedAt ?? null,
      case_appeal_resolved_by_id:
        report.reportCase?.appealResolvedById ?? null,
      case_appeal_ai_summary: report.reportCase?.appealAiSummary ?? null,
      case_appeal_ai_recommendation:
        report.reportCase?.appealAiRecommendation ?? null,
      case_appeal_ai_confidence:
        report.reportCase?.appealAiConfidence ?? null,
      case_appeal_ai_checked_at: report.reportCase?.appealAiCheckedAt ?? null,
      type,
      reason: report.reason,
      description: report.description,
      status: report.status,
      created_at: report.createdAt,
      updated_at: report.updatedAt,
      resolved_at: report.resolvedAt,
      reporter: {
        id: reporter.id,
        display_name: reporter.displayName,
        email: reporter.email,
      },
      target: {
        id: chapter.id,
        chapter_number: chapter.chapterNumber,
        title: chapter.title,
        content_preview: normalizeText(chapter.content).slice(0, 1200),
        content_truncated: normalizeText(chapter.content).length > 1200,
        status: chapter.status,
        is_hidden: Boolean(chapter.isHidden),
        hidden_at: chapter.hiddenAt ?? null,
        story: story.id
            ? {
                id: story.id,
                title: story.title,
                slug: story.slug,
                author: story.author
                    ? {
                        id: story.author.id,
                        display_name: story.author.displayName,
                        email: story.author.email,
                      }
                    : null,
              }
            : null,
      },
    };
  }

  const comment = report.comment ?? {};
  const chapter = comment.chapter ?? {};
  const story = chapter.story ?? {};
  const commentAuthor = comment.user ?? {};
  return {
    id: report.id,
    case_id: report.reportCase?.id ?? null,
    case_status: report.reportCase?.status ?? null,
    case_resolution_action: report.reportCase?.resolutionAction ?? null,
    case_last_resolution_action:
      report.reportCase?.lastResolutionAction ?? null,
    case_report_count: report.reportCase?.reportCount ?? null,
    case_unique_reporter_count: report.reportCase?.uniqueReporterCount ?? null,
    case_risk_score: report.reportCase?.riskScore ?? null,
    case_priority: report.reportCase?.priority ?? null,
    case_reopened_count: report.reportCase?.reopenedCount ?? null,
    case_last_reported_at: report.reportCase?.lastReportedAt ?? null,
    case_restored_at: report.reportCase?.restoredAt ?? null,
    case_restored_by_id: report.reportCase?.restoredById ?? null,
    case_ai_flagged: report.reportCase?.aiFlagged ?? false,
    case_ai_categories: report.reportCase?.aiCategories ?? null,
    case_ai_confidence: report.reportCase?.aiConfidence ?? null,
    case_ai_severity: report.reportCase?.aiSeverity ?? null,
    case_ai_summary: report.reportCase?.aiSummary ?? null,
    case_ai_suggested_action: report.reportCase?.aiSuggestedAction ?? null,
    case_ai_checked_at: report.reportCase?.aiCheckedAt ?? null,
    case_appeal_status: report.reportCase?.appealStatus ?? null,
    case_appeal_reason: report.reportCase?.appealReason ?? null,
    case_appeal_submitted_at: report.reportCase?.appealSubmittedAt ?? null,
    case_appeal_resolved_at: report.reportCase?.appealResolvedAt ?? null,
    case_appeal_resolved_by_id: report.reportCase?.appealResolvedById ?? null,
    case_appeal_ai_summary: report.reportCase?.appealAiSummary ?? null,
    case_appeal_ai_recommendation:
      report.reportCase?.appealAiRecommendation ?? null,
    case_appeal_ai_confidence: report.reportCase?.appealAiConfidence ?? null,
    case_appeal_ai_checked_at: report.reportCase?.appealAiCheckedAt ?? null,
    type,
    reason: report.reason,
    description: report.description,
    status: report.status,
    created_at: report.createdAt,
    updated_at: report.updatedAt,
    resolved_at: report.resolvedAt,
    reporter: {
      id: reporter.id,
      display_name: reporter.displayName,
      email: reporter.email,
    },
    target: {
      id: comment.id,
      content: comment.content,
      is_edited: comment.isEdited,
      is_hidden: Boolean(comment.isHidden),
      hidden_at: comment.hiddenAt ?? null,
      created_at: comment.createdAt,
      author: commentAuthor.id
          ? {
              id: commentAuthor.id,
              display_name: commentAuthor.displayName,
              email: commentAuthor.email,
            }
          : null,
      chapter: chapter.id
          ? {
              id: chapter.id,
              chapter_number: chapter.chapterNumber,
              title: chapter.title,
              story: story.id
                  ? {
                      id: story.id,
                      title: story.title,
                      slug: story.slug,
                    }
                  : null,
            }
          : null,
    },
  };
};

const getAdminReportInclude = (type) => {
  if (type === "story") {
    return {
      reportCase: {
        select: {
          id: true,
          status: true,
          priority: true,
          resolutionAction: true,
          lastResolutionAction: true,
          riskScore: true,
          reportCount: true,
          uniqueReporterCount: true,
          reopenedCount: true,
          aiFlagged: true,
          aiCategories: true,
          aiConfidence: true,
          aiSeverity: true,
          aiSummary: true,
          aiSuggestedAction: true,
          aiCheckedAt: true,
          appealStatus: true,
          appealReason: true,
          appealSubmittedAt: true,
          appealResolvedAt: true,
          appealResolvedById: true,
          appealAiSummary: true,
          appealAiRecommendation: true,
          appealAiConfidence: true,
          appealAiCheckedAt: true,
          lastReportedAt: true,
          resolvedAt: true,
          restoredAt: true,
          restoredById: true,
        },
      },
      reporter: {
        select: { id: true, displayName: true, email: true },
      },
      story: {
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          coverUrl: true,
          status: true,
          isHidden: true,
          hiddenAt: true,
          hiddenById: true,
          hiddenReason: true,
          author: {
            select: { id: true, displayName: true, email: true },
          },
          storyGenres: {
            select: {
              genre: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      },
    };
  }

  if (type === "chapter") {
    return {
      reportCase: {
        select: {
          id: true,
          status: true,
          priority: true,
          resolutionAction: true,
          lastResolutionAction: true,
          riskScore: true,
          reportCount: true,
          uniqueReporterCount: true,
          reopenedCount: true,
          aiFlagged: true,
          aiCategories: true,
          aiConfidence: true,
          aiSeverity: true,
          aiSummary: true,
          aiSuggestedAction: true,
          aiCheckedAt: true,
          appealStatus: true,
          appealReason: true,
          appealSubmittedAt: true,
          appealResolvedAt: true,
          appealResolvedById: true,
          appealAiSummary: true,
          appealAiRecommendation: true,
          appealAiConfidence: true,
          appealAiCheckedAt: true,
          lastReportedAt: true,
          resolvedAt: true,
          restoredAt: true,
          restoredById: true,
        },
      },
      reporter: {
        select: { id: true, displayName: true, email: true },
      },
      chapter: {
        select: {
          id: true,
          chapterNumber: true,
          title: true,
          content: true,
          status: true,
          isHidden: true,
          hiddenAt: true,
          hiddenById: true,
          hiddenReason: true,
          story: {
            select: {
              id: true,
              title: true,
              slug: true,
              author: {
                select: { id: true, displayName: true, email: true },
              },
            },
          },
        },
      },
    };
  }

  return {
    reportCase: {
      select: {
        id: true,
        status: true,
        priority: true,
        resolutionAction: true,
        lastResolutionAction: true,
        riskScore: true,
        reportCount: true,
        uniqueReporterCount: true,
        reopenedCount: true,
        aiFlagged: true,
        aiCategories: true,
        aiConfidence: true,
        aiSeverity: true,
        aiSummary: true,
        aiSuggestedAction: true,
        aiCheckedAt: true,
        appealStatus: true,
        appealReason: true,
        appealSubmittedAt: true,
        appealResolvedAt: true,
        appealResolvedById: true,
        appealAiSummary: true,
        appealAiRecommendation: true,
        appealAiConfidence: true,
        appealAiCheckedAt: true,
        lastReportedAt: true,
        resolvedAt: true,
        restoredAt: true,
        restoredById: true,
      },
    },
    reporter: {
      select: { id: true, displayName: true, email: true },
    },
    comment: {
      select: {
        id: true,
        content: true,
        isEdited: true,
        isHidden: true,
        hiddenAt: true,
        createdAt: true,
        user: {
          select: { id: true, displayName: true, email: true },
        },
        chapter: {
          select: {
            id: true,
            chapterNumber: true,
            title: true,
            story: {
              select: {
                id: true,
                title: true,
                slug: true,
              },
            },
          },
        },
      },
    },
  };
};

const getAdminReportDelegate = (type, db = prisma) => {
  if (type === "story") return db.storyReport;
  if (type === "chapter") return db.chapterReport;
  return db.chapterCommentReport;
};

const getReportCaseTargetType = (type) => {
  if (type === "story") return "story";
  if (type === "chapter") return "chapter";
  return "chapter_comment";
};

const deriveReportCaseState = ({ type, reports }) => {
  const hasPending = reports.some((report) => report.status === "pending");
  if (hasPending) {
    return {
      status: "pending",
      resolutionAction: null,
      resolvedAt: null,
    };
  }

  if (type === "chapter_comment") {
    return {
      status: "resolved",
      resolutionAction: reports.some((report) => report.status === "removed")
        ? "comment_removed"
        : "ignored",
      resolvedAt: reports.reduce((latest, report) => {
        const candidate = report.resolvedAt ?? report.updatedAt ?? latest;
        return candidate > latest ? candidate : latest;
      }, new Date(0)),
    };
  }

  return {
    status: "resolved",
    resolutionAction: reports.some((report) => report.status === "action_taken")
      ? type === "story"
        ? "story_hidden"
        : "chapter_hidden"
      : "ignored",
    resolvedAt: reports.reduce((latest, report) => {
      const candidate = report.resolvedAt ?? report.updatedAt ?? latest;
      return candidate > latest ? candidate : latest;
    }, new Date(0)),
  };
};

const ensureReportCase = async ({ db = prisma, type, targetId }) => {
  const targetType = getReportCaseTargetType(type);
  return db.reportCase.upsert({
    where: {
      targetType_targetId: {
        targetType,
        targetId,
      },
    },
    update: {},
    create: {
      targetType,
      targetId,
      status: "pending",
      priority: "low",
      lastReportedAt: new Date(),
    },
    select: { id: true, status: true },
  });
};

const reopenReportCaseIfNeeded = async ({ db = prisma, caseId }) => {
  if (!caseId) return;
  await db.reportCase.updateMany({
    where: {
      id: caseId,
      status: "resolved",
    },
    data: {
      reopenedCount: {
        increment: 1,
      },
    },
  });
};

const syncReportCase = async ({ db = prisma, type, caseId }) => {
  const delegate = getAdminReportDelegate(type, db);
    const existingCase = await db.reportCase.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        reopenedCount: true,
        lastResolutionAction: true,
        aiFlagged: true,
        aiConfidence: true,
        aiSeverity: true,
        aiSuggestedAction: true,
      },
    });
  if (!existingCase) return null;

  const reports = await delegate.findMany({
    where: { caseId },
    select: {
      status: true,
      reporterId: true,
      reason: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
    },
  });

  if (!reports.length) return null;

  const state = deriveReportCaseState({ type, reports });
  const reportCount = reports.length;
  const uniqueReporterCount = new Set(reports.map((report) => report.reporterId)).size;
  const lastReportedAt = reports.reduce((latest, report) => {
    return report.createdAt > latest ? report.createdAt : latest;
  }, reports[0].createdAt);
    const riskScore = calculateReportCaseRisk({
      reports,
      reopenedCount: existingCase.reopenedCount,
      ai: {
        flagged: existingCase.aiFlagged,
        confidence: existingCase.aiConfidence,
        severity: existingCase.aiSeverity,
        suggestedAction: existingCase.aiSuggestedAction,
      },
    });
  const priority = deriveReportCasePriority(riskScore);

  return db.reportCase.update({
    where: { id: caseId },
    data: {
      status: state.status,
      priority,
      resolutionAction: state.resolutionAction,
      lastResolutionAction:
        state.status === "resolved"
          ? state.resolutionAction
          : existingCase.lastResolutionAction,
      riskScore,
      reportCount,
      uniqueReporterCount,
      lastReportedAt,
      resolvedAt: state.status === "pending" ? null : state.resolvedAt,
    },
    select: { id: true },
  });
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
  if (comment.isHidden) {
    throw new Error("Binh luan da bi go");
  }

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
      isHidden: true,
    },
  });

  if (!story) throw new Error("Khong tim thay truyen");

  const canViewDraft = story.authorId === requester.id || isAdmin(requester);
  if (story.status !== "published" && !canViewDraft) {
    throw new Error("Truyen chua duoc xuat ban");
  }
  if (story.isHidden) {
    throw new Error("Truyen da bi an boi quan tri vien");
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
          isHidden: true,
        },
      },
    },
  });

  if (!chapter) throw new Error("Khong tim thay chuong");

  const canViewDraft = chapter.story.authorId === requester.id || isAdmin(requester);
  if (chapter.story.status !== "published" && !canViewDraft) {
    throw new Error("Truyen chua duoc xuat ban");
  }
  if (chapter.story.isHidden && !isAdmin(requester) && chapter.story.authorId !== requester.id) {
    throw new Error("Truyen da bi an boi quan tri vien");
  }
  if (chapter.status !== "published" && !canViewDraft) {
    throw new Error("Chuong chua duoc xuat ban");
  }
  if (chapter.isHidden) {
    throw new Error("Chuong da bi an boi quan tri vien");
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
      caseId: true,
      status: true,
      createdAt: true,
    },
  });

  if (existingReport) {
    if (existingReport.status === "pending") {
      return {
        reported: true,
        already_reported: true,
        report_id: existingReport.id,
        status: existingReport.status,
        created_at: existingReport.createdAt,
        message: "Báo cáo trước đó đã được ghi nhận",
      };
    }

    const reopenedReport = await prisma.chapterCommentReport.update({
      where: { id: existingReport.id },
      data: {
        reason: normalizedReason,
        description: normalizedDescription,
        status: "pending",
        resolvedAt: null,
      },
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    });
    await reopenReportCaseIfNeeded({
      caseId: existingReport.caseId,
    });
    await syncReportCase({
      type: "chapter_comment",
      caseId: existingReport.caseId,
    });
    await notificationService.createNotification({
      recipientId: requester.id,
      actorId: null,
      storyId: comment.chapter?.story?.id ?? null,
      chapterId: comment.chapter?.id ?? null,
      type: "admin_message",
      title: "Báo cáo đã được ghi nhận",
      body: "AI đang xem xét báo cáo của bạn. Kết quả sẽ được thông báo khi hoàn tất.",
      linkUrl: buildReportTargetLink({
        type: "chapter_comment",
        storySlug: comment.chapter?.story?.slug,
        chapterId: comment.chapter?.id,
      }),
      meta: {
        case_id: existingReport.caseId,
        audience: "reporter",
        report_type: "chapter_comment",
        resolution_action: "report_submitted",
      },
    });
    scheduleReportCaseAiAnalysis({
      type: "chapter_comment",
      caseId: existingReport.caseId,
      recipientId: requester.id,
      storyId: comment.chapter?.story?.id ?? null,
      chapterId: comment.chapter?.id ?? null,
      storySlug: comment.chapter?.story?.slug ?? null,
    });

    return {
      reported: true,
      already_reported: false,
      report_id: reopenedReport.id,
      reason: reopenedReport.reason,
      status: reopenedReport.status,
      created_at: reopenedReport.createdAt,
      message: "Bao cao binh luan da duoc mo lai",
    };
  }

  const reportCase = await ensureReportCase({
    type: "chapter_comment",
    targetId: comment.id,
  });

  const report = await prisma.chapterCommentReport.create({
    data: {
      caseId: reportCase.id,
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
  await reopenReportCaseIfNeeded({
    caseId: reportCase.id,
  });
  await syncReportCase({
    type: "chapter_comment",
    caseId: reportCase.id,
  });
  await notificationService.createNotification({
    recipientId: requester.id,
    actorId: null,
    storyId: comment.chapter?.story?.id ?? null,
    chapterId: comment.chapter?.id ?? null,
    type: "admin_message",
    title: "Báo cáo đã được ghi nhận",
    body: "AI đang xem xét báo cáo của bạn. Kết quả sẽ được thông báo khi hoàn tất.",
    linkUrl: buildReportTargetLink({
      type: "chapter_comment",
      storySlug: comment.chapter?.story?.slug,
      chapterId: comment.chapter?.id,
    }),
    meta: {
      case_id: reportCase.id,
      audience: "reporter",
      report_type: "chapter_comment",
      resolution_action: "report_submitted",
    },
  });
  scheduleReportCaseAiAnalysis({
    type: "chapter_comment",
    caseId: reportCase.id,
    recipientId: requester.id,
    storyId: comment.chapter?.story?.id ?? null,
    chapterId: comment.chapter?.id ?? null,
    storySlug: comment.chapter?.story?.slug ?? null,
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
      caseId: true,
      status: true,
      createdAt: true,
    },
  });

  if (existingReport) {
    if (existingReport.status === "pending") {
      return {
        reported: true,
        already_reported: true,
        report_id: existingReport.id,
        status: existingReport.status,
        created_at: existingReport.createdAt,
        message: "Báo cáo trước đó đã được ghi nhận",
      };
    }

    const reopenedReport = await prisma.storyReport.update({
      where: { id: existingReport.id },
      data: {
        reason: normalizedReason,
        description: normalizedDescription,
        status: "pending",
        resolvedAt: null,
      },
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    });
    await reopenReportCaseIfNeeded({
      caseId: existingReport.caseId,
    });
    await syncReportCase({
      type: "story",
      caseId: existingReport.caseId,
    });
    await notificationService.createNotification({
      recipientId: requester.id,
      actorId: null,
      storyId: story.id,
      chapterId: null,
      type: "admin_message",
      title: "Báo cáo đã được ghi nhận",
      body: "AI đang xem xét báo cáo của bạn. Kết quả sẽ được thông báo khi hoàn tất.",
      linkUrl: buildReportTargetLink({
        type: "story",
        storySlug: story.slug,
        chapterId: null,
      }),
      meta: {
        case_id: existingReport.caseId,
        audience: "reporter",
        report_type: "story",
        resolution_action: "report_submitted",
      },
    });
    scheduleReportCaseAiAnalysis({
      type: "story",
      caseId: existingReport.caseId,
      recipientId: requester.id,
      storyId: story.id,
      chapterId: null,
      storySlug: story.slug ?? null,
    });

    return {
      reported: true,
      already_reported: false,
      report_id: reopenedReport.id,
      reason: reopenedReport.reason,
      status: reopenedReport.status,
      created_at: reopenedReport.createdAt,
      message: "Bao cao truyen da duoc mo lai",
    };
  }

  const reportCase = await ensureReportCase({
    type: "story",
    targetId: story.id,
  });

  const report = await prisma.storyReport.create({
    data: {
      caseId: reportCase.id,
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
  await reopenReportCaseIfNeeded({
    caseId: reportCase.id,
  });
  await syncReportCase({
    type: "story",
    caseId: reportCase.id,
  });
  await notificationService.createNotification({
    recipientId: requester.id,
    actorId: null,
    storyId: story.id,
    chapterId: null,
    type: "admin_message",
    title: "Báo cáo đã được ghi nhận",
    body: "AI đang xem xét báo cáo của bạn. Kết quả sẽ được thông báo khi hoàn tất.",
    linkUrl: buildReportTargetLink({
      type: "story",
      storySlug: story.slug,
      chapterId: null,
    }),
    meta: {
      case_id: reportCase.id,
      audience: "reporter",
      report_type: "story",
      resolution_action: "report_submitted",
    },
  });
  scheduleReportCaseAiAnalysis({
    type: "story",
    caseId: reportCase.id,
    recipientId: requester.id,
    storyId: story.id,
    chapterId: null,
    storySlug: story.slug ?? null,
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
      caseId: true,
      status: true,
      createdAt: true,
    },
  });

  if (existingReport) {
    if (existingReport.status === "pending") {
      return {
        reported: true,
        already_reported: true,
        report_id: existingReport.id,
        status: existingReport.status,
        created_at: existingReport.createdAt,
        message: "Báo cáo trước đó đã được ghi nhận",
      };
    }

    const reopenedReport = await prisma.chapterReport.update({
      where: { id: existingReport.id },
      data: {
        reason: normalizedReason,
        description: normalizedDescription,
        status: "pending",
        resolvedAt: null,
      },
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    });
    await reopenReportCaseIfNeeded({
      caseId: existingReport.caseId,
    });
    await syncReportCase({
      type: "chapter",
      caseId: existingReport.caseId,
    });
    await notificationService.createNotification({
      recipientId: requester.id,
      actorId: null,
      storyId: chapter.story?.id ?? null,
      chapterId: chapter.id,
      type: "admin_message",
      title: "Báo cáo đã được ghi nhận",
      body: "AI đang xem xét báo cáo của bạn. Kết quả sẽ được thông báo khi hoàn tất.",
      linkUrl: buildReportTargetLink({
        type: "chapter",
        storySlug: chapter.story?.slug,
        chapterId: chapter.id,
      }),
      meta: {
        case_id: existingReport.caseId,
        audience: "reporter",
        report_type: "chapter",
        resolution_action: "report_submitted",
      },
    });
    scheduleReportCaseAiAnalysis({
      type: "chapter",
      caseId: existingReport.caseId,
      recipientId: requester.id,
      storyId: chapter.story?.id ?? null,
      chapterId: chapter.id,
      storySlug: chapter.story?.slug ?? null,
    });

    return {
      reported: true,
      already_reported: false,
      report_id: reopenedReport.id,
      reason: reopenedReport.reason,
      status: reopenedReport.status,
      created_at: reopenedReport.createdAt,
      message: "Bao cao chuong da duoc mo lai",
    };
  }

  const reportCase = await ensureReportCase({
    type: "chapter",
    targetId: chapter.id,
  });

  const report = await prisma.chapterReport.create({
    data: {
      caseId: reportCase.id,
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
  await reopenReportCaseIfNeeded({
    caseId: reportCase.id,
  });
  await syncReportCase({
    type: "chapter",
    caseId: reportCase.id,
  });
  await notificationService.createNotification({
    recipientId: requester.id,
    actorId: null,
    storyId: chapter.story?.id ?? null,
    chapterId: chapter.id,
    type: "admin_message",
    title: "Báo cáo đã được ghi nhận",
    body: "AI đang xem xét báo cáo của bạn. Kết quả sẽ được thông báo khi hoàn tất.",
    linkUrl: buildReportTargetLink({
      type: "chapter",
      storySlug: chapter.story?.slug,
      chapterId: chapter.id,
    }),
    meta: {
      case_id: reportCase.id,
      audience: "reporter",
      report_type: "chapter",
      resolution_action: "report_submitted",
    },
  });
  scheduleReportCaseAiAnalysis({
    type: "chapter",
    caseId: reportCase.id,
    recipientId: requester.id,
    storyId: chapter.story?.id ?? null,
    chapterId: chapter.id,
    storySlug: chapter.story?.slug ?? null,
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

const listAdminReports = async ({ type, status, page, limit }) => {
  const normalizedType = normalizeText(type).toLowerCase();
  const resolvedPage = parsePositiveInteger(page, 1);
  const resolvedLimit = Math.min(parsePositiveInteger(limit, 20), 100);
  const reportTypes = normalizedType
    ? [validateAdminReportType(normalizedType)]
    : ["story", "chapter", "chapter_comment"];

  const normalizedStatus = normalizeText(status).toLowerCase();
  const items = [];

  for (const reportType of reportTypes) {
    const validatedStatus = validateAdminReportStatus({
      type: reportType,
      status: normalizedStatus,
    });
    const delegate = getAdminReportDelegate(reportType);
    const reports = await delegate.findMany({
      where: validatedStatus ? { status: validatedStatus } : undefined,
      include: getAdminReportInclude(reportType),
      orderBy: { createdAt: "desc" },
    });

    items.push(
      ...reports.map((report) =>
        buildReportSummary({ type: reportType, report }),
      ),
    );
  }

  items.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const total = items.length;
  const start = (resolvedPage - 1) * resolvedLimit;
  const pagedItems = items.slice(start, start + resolvedLimit);

  return {
    items: pagedItems,
    pagination: {
      page: resolvedPage,
      limit: resolvedLimit,
      total,
      total_pages: Math.max(1, Math.ceil(total / resolvedLimit)),
    },
  };
};

const getAdminReportDetail = async ({ type, reportId }) => {
  const normalizedType = validateAdminReportType(type);
  const normalizedReportId = normalizeText(reportId);
  if (!normalizedReportId) throw new Error("Thieu id bao cao");

  const delegate = getAdminReportDelegate(normalizedType);
  const report = await delegate.findUnique({
    where: { id: normalizedReportId },
    include: getAdminReportInclude(normalizedType),
  });

  if (!report) throw new Error("Khong tim thay bao cao");

  return buildReportSummary({ type: normalizedType, report });
};

const updateChapterCommentModeration = async ({
  reportId,
  status,
  requester,
}) => {
  const now = new Date();
  let shouldRecomputeFeatured = false;

  const transactionResult = await prisma.$transaction(async (tx) => {
    const existingReport = await tx.chapterCommentReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        caseId: true,
        reason: true,
        reporter: {
          select: { id: true, displayName: true, email: true },
        },
        comment: {
          select: {
            id: true,
            content: true,
            isHidden: true,
            userId: true,
            chapterId: true,
            chapter: {
              select: {
                id: true,
                chapterNumber: true,
                title: true,
                story: {
                  select: {
                    id: true,
                    title: true,
                    slug: true,
                  },
                },
              },
            },
            user: {
              select: { id: true, displayName: true, email: true },
            },
          },
        },
      },
    });

    if (!existingReport) throw new Error("Khong tim thay bao cao");

    let ownerNotified = false;

    if (status === "removed" && !existingReport.comment.isHidden) {
      await tx.chapterComment.update({
        where: { id: existingReport.comment.id },
        data: {
          isHidden: true,
          hiddenAt: now,
          hiddenById: requester.id,
          hiddenReason: `report:${existingReport.reason}`,
        },
      });

      const currentStats = await tx.chapterStat.findUnique({
        where: { chapterId: existingReport.comment.chapterId },
        select: { commentCount: true },
      });

      if (currentStats) {
        await tx.chapterStat.update({
          where: { chapterId: existingReport.comment.chapterId },
          data: {
            commentCount: Math.max(0, currentStats.commentCount - 1),
          },
        });
      }

      ownerNotified = true;
      shouldRecomputeFeatured = true;
    }

    await tx.chapterCommentReport.update({
      where: { id: reportId },
      data: {
        status,
        resolvedAt: status === "pending" ? null : now,
      },
    });
    await syncReportCase({
      db: tx,
      type: "chapter_comment",
      caseId: existingReport.caseId,
    });
    const report = await tx.chapterCommentReport.findUnique({
      where: { id: reportId },
      include: getAdminReportInclude("chapter_comment"),
    });

    return {
      report,
      caseId: existingReport.caseId,
      ownerNotified,
      reporter: existingReport.reporter,
      comment: existingReport.comment,
    };
  }, { timeout: 15000, maxWait: 10000 });

  const { report, caseId, ownerNotified, reporter, comment } = transactionResult;
  const chapter = comment.chapter;
  const story = chapter?.story;
  const linkUrl =
    story?.slug && chapter?.id
      ? `/stories/${story.slug}/chapters/${chapter.id}`
      : null;

  if (shouldRecomputeFeatured && chapter?.id) {
    await recomputeChapterFeaturedComment({
      chapterId: chapter.id,
    });
  }

  await analyzeReportCaseAi({
    type: "chapter_comment",
    caseId,
  });

  if (status !== "pending" && reporter?.id) {
    await notificationService.createNotification({
      recipientId: reporter.id,
      actorId: requester.id,
      storyId: story?.id ?? null,
      chapterId: chapter?.id ?? null,
      type: "admin_message",
      title:
        status === "removed"
          ? "Báo cáo bình luận của bạn đã được xử lý"
          : "Báo cáo bình luận của bạn đã được xem xét",
      body:
        status === "removed"
          ? "Quản trị viên đã gỡ bình luận bị báo cáo."
          : "Quản trị viên đã xem xét nhưng không gỡ bình luận này.",
      linkUrl,
      meta: {
        audience: "reporter",
        report_id: report.id,
        report_type: "chapter_comment",
        report_status: status,
        resolution_action: status === "removed" ? "comment_removed" : "ignored",
        target_type: "chapter_comment",
        comment_id: comment.id,
        chapter_id: chapter?.id ?? null,
        chapter_number: chapter?.chapterNumber ?? null,
        chapter_title: chapter?.title ?? null,
        story_title: story?.title ?? null,
      },
    });
  }

  if (status === "removed" && ownerNotified && comment.userId !== requester.id) {
    await notificationService.createNotification({
      recipientId: comment.userId,
      actorId: requester.id,
      storyId: story?.id ?? null,
      chapterId: chapter?.id ?? null,
      type: "admin_message",
      title: "Bình luận của bạn đã bị gỡ",
      body: "Quản trị viên đã gỡ bình luận của bạn sau khi xem xét báo cáo.",
      linkUrl,
      meta: {
        audience: "owner",
        case_id: caseId,
        report_type: "chapter_comment",
        resolution_action: "comment_removed",
        target_type: "chapter_comment",
        comment_id: comment.id,
        chapter_id: chapter?.id ?? null,
        chapter_number: chapter?.chapterNumber ?? null,
        chapter_title: chapter?.title ?? null,
        story_title: story?.title ?? null,
        moderated_by: getRequesterDisplayName(requester),
      },
    });
  }

  const refreshedReport = await prisma.chapterCommentReport.findUnique({
    where: { id: report.id },
    include: getAdminReportInclude("chapter_comment"),
  });

  return buildReportSummary({
    type: "chapter_comment",
    report: refreshedReport || report,
  });
};

const updateChapterModeration = async ({
  reportId,
  status,
  requester,
}) => {
  const now = new Date();

  const transactionResult = await prisma.$transaction(async (tx) => {
    const existingReport = await tx.chapterReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        caseId: true,
        reason: true,
        reporter: {
          select: { id: true, displayName: true, email: true },
        },
        chapter: {
          select: {
            id: true,
            chapterNumber: true,
            title: true,
            status: true,
            isHidden: true,
            storyId: true,
            story: {
              select: {
                id: true,
                title: true,
                slug: true,
                authorId: true,
                author: {
                  select: { id: true, displayName: true, email: true },
                },
              },
            },
          },
        },
      },
    });

    if (!existingReport) throw new Error("Khong tim thay bao cao");

    let ownerNotified = false;

    if (status === "action_taken" && !existingReport.chapter.isHidden) {
      await tx.chapter.update({
        where: { id: existingReport.chapter.id },
        data: {
          isHidden: true,
          hiddenAt: now,
          hiddenById: requester.id,
          hiddenReason: `report:${existingReport.reason}`,
        },
      });
      ownerNotified = true;
    }

    await tx.chapterReport.update({
      where: { id: reportId },
      data: {
        status,
        resolvedAt: status === "pending" ? null : now,
      },
    });
    await syncReportCase({
      db: tx,
      type: "chapter",
      caseId: existingReport.caseId,
    });
    const report = await tx.chapterReport.findUnique({
      where: { id: reportId },
      include: getAdminReportInclude("chapter"),
    });

    return {
      report,
      caseId: existingReport.caseId,
      reporter: existingReport.reporter,
      chapter: existingReport.chapter,
      ownerNotified,
    };
  }, { timeout: 15000, maxWait: 10000 });

  const { report, caseId, reporter, chapter, ownerNotified } = transactionResult;
  const story = chapter.story;
  const linkUrl =
    story?.slug && chapter?.id
      ? `/stories/${story.slug}/chapters/${chapter.id}`
      : null;

  if (status !== "pending" && reporter?.id) {
    await notificationService.createNotification({
      recipientId: reporter.id,
      actorId: requester.id,
      storyId: story?.id ?? null,
      chapterId: chapter?.id ?? null,
      type: "admin_message",
      title:
        status === "action_taken"
          ? "Báo cáo chương của bạn đã được xử lý"
          : "Báo cáo chương của bạn đã được xem xét",
      body:
        status === "action_taken"
          ? "Quản trị viên đã ẩn chương bị báo cáo."
          : "Quản trị viên đã xem xét nhưng không ẩn chương này.",
      linkUrl,
      meta: {
        audience: "reporter",
        report_id: report.id,
        report_type: "chapter",
        report_status: status,
        resolution_action: status === "action_taken" ? "chapter_hidden" : "ignored",
        target_type: "chapter",
        chapter_id: chapter.id,
        chapter_number: chapter.chapterNumber,
        chapter_title: chapter.title,
        story_title: story?.title ?? null,
      },
    });
  }

  if (status === "action_taken" && ownerNotified && chapter.story.authorId !== requester.id) {
    await notificationService.createNotification({
      recipientId: chapter.story.authorId,
      actorId: requester.id,
      storyId: story?.id ?? null,
      chapterId: chapter?.id ?? null,
      type: "admin_message",
      title: "Chương của bạn đã bị ẩn",
      body: "Quản trị viên đã ẩn chương của bạn sau khi xem xét báo cáo.",
      linkUrl,
      meta: {
        audience: "owner",
        case_id: caseId,
        report_type: "chapter",
        resolution_action: "chapter_hidden",
        target_type: "chapter",
        chapter_id: chapter.id,
        chapter_number: chapter.chapterNumber,
        chapter_title: chapter.title,
        story_title: story?.title ?? null,
        moderated_by: getRequesterDisplayName(requester),
      },
    });
  }

  await analyzeReportCaseAi({
    type: "chapter",
    caseId,
  });

  const refreshedReport = await prisma.chapterReport.findUnique({
    where: { id: report.id },
    include: getAdminReportInclude("chapter"),
  });

  return buildReportSummary({
    type: "chapter",
    report: refreshedReport || report,
  });
};

const updateStoryModeration = async ({
  reportId,
  status,
  requester,
}) => {
  const now = new Date();

  const transactionResult = await prisma.$transaction(async (tx) => {
    const existingReport = await tx.storyReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        caseId: true,
        reason: true,
        reporter: {
          select: { id: true, displayName: true, email: true },
        },
        story: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            isHidden: true,
            authorId: true,
            author: {
              select: { id: true, displayName: true, email: true },
            },
          },
        },
      },
    });

    if (!existingReport) throw new Error("Khong tim thay bao cao");

    let ownerNotified = false;

    if (status === "action_taken" && !existingReport.story.isHidden) {
      await tx.story.update({
        where: { id: existingReport.story.id },
        data: {
          isHidden: true,
          hiddenAt: now,
          hiddenById: requester.id,
          hiddenReason: `report:${existingReport.reason}`,
        },
      });
      ownerNotified = true;
    }

    await tx.storyReport.update({
      where: { id: reportId },
      data: {
        status,
        resolvedAt: status === "pending" ? null : now,
      },
    });
    await syncReportCase({
      db: tx,
      type: "story",
      caseId: existingReport.caseId,
    });
    const report = await tx.storyReport.findUnique({
      where: { id: reportId },
      include: getAdminReportInclude("story"),
    });

    return {
      report,
      caseId: existingReport.caseId,
      reporter: existingReport.reporter,
      story: existingReport.story,
      ownerNotified,
    };
  }, { timeout: 15000, maxWait: 10000 });

  const { report, caseId, reporter, story, ownerNotified } = transactionResult;
  const linkUrl = story?.slug ? `/stories/${story.slug}` : null;

  if (status !== "pending" && reporter?.id) {
    await notificationService.createNotification({
      recipientId: reporter.id,
      actorId: requester.id,
      storyId: story?.id ?? null,
      type: "admin_message",
      title:
        status === "action_taken"
          ? "Báo cáo truyện của bạn đã được xử lý"
          : "Báo cáo truyện của bạn đã được xem xét",
      body:
        status === "action_taken"
          ? "Quản trị viên đã ẩn truyện bị báo cáo."
          : "Quản trị viên đã xem xét nhưng không ẩn truyện này.",
      linkUrl,
      meta: {
        audience: "reporter",
        report_id: report.id,
        report_type: "story",
        report_status: status,
        resolution_action: status === "action_taken" ? "story_hidden" : "ignored",
        target_type: "story",
        story_id: story.id,
        story_title: story.title,
      },
    });
  }

  if (status === "action_taken" && ownerNotified && story.authorId !== requester.id) {
    await notificationService.createNotification({
      recipientId: story.authorId,
      actorId: requester.id,
      storyId: story?.id ?? null,
      type: "admin_message",
      title: "Truyện của bạn đã bị ẩn",
      body: "Quản trị viên đã ẩn truyện của bạn sau khi xem xét báo cáo.",
      linkUrl,
      meta: {
        audience: "owner",
        case_id: caseId,
        report_type: "story",
        resolution_action: "story_hidden",
        target_type: "story",
        story_id: story.id,
        story_title: story.title,
        moderated_by: getRequesterDisplayName(requester),
      },
    });
  }

  await analyzeReportCaseAi({
    type: "story",
    caseId,
  });

  const refreshedReport = await prisma.storyReport.findUnique({
    where: { id: report.id },
    include: getAdminReportInclude("story"),
  });

  return buildReportSummary({
    type: "story",
    report: refreshedReport || report,
  });
};

const updateAdminReportStatus = async ({ type, reportId, status, requester }) => {
  const normalizedType = validateAdminReportType(type);
  const normalizedReportId = normalizeText(reportId);
  if (!normalizedReportId) throw new Error("Thieu id bao cao");

  const normalizedStatus = validateAdminReportStatus({
    type: normalizedType,
    status,
  });
  if (!normalizedStatus) throw new Error("Thieu trang thai bao cao");

  if (!requester?.id) throw new Error("Chua dang nhap");

  if (normalizedType === "chapter_comment") {
    return updateChapterCommentModeration({
      reportId: normalizedReportId,
      status: normalizedStatus,
      requester,
    });
  }
  if (normalizedType === "chapter") {
    return updateChapterModeration({
      reportId: normalizedReportId,
      status: normalizedStatus,
      requester,
    });
  }
  if (normalizedType === "story") {
    return updateStoryModeration({
      reportId: normalizedReportId,
      status: normalizedStatus,
      requester,
    });
  }

  const delegate = getAdminReportDelegate(normalizedType);
  const existingReport = await delegate.findUnique({
    where: { id: normalizedReportId },
    select: { id: true },
  });
  if (!existingReport) throw new Error("Khong tim thay bao cao");

  const report = await delegate.update({
    where: { id: normalizedReportId },
    data: {
      status: normalizedStatus,
      resolvedAt: normalizedStatus === "pending" ? null : new Date(),
    },
    include: getAdminReportInclude(normalizedType),
  });

  return buildReportSummary({ type: normalizedType, report });
};

const getCriticalCaseReportIds = (reportCase) => {
  if (reportCase.targetType === "chapter_comment") {
    return reportCase.chapterCommentReports.map((report) => report.id);
  }
  if (reportCase.targetType === "chapter") {
    return reportCase.chapterReports.map((report) => report.id);
  }
  return reportCase.storyReports.map((report) => report.id);
};

const getDefaultActionStatusForType = (type) =>
  type === "chapter_comment" ? "removed" : "action_taken";

const processCriticalAdminReportCases = async ({ requester }) => {
  if (!requester?.id) throw new Error("Chua dang nhap");

  const criticalCases = await prisma.reportCase.findMany({
    where: {
      status: "pending",
      priority: "critical",
    },
    orderBy: [{ riskScore: "desc" }, { lastReportedAt: "asc" }],
    include: {
      storyReports: {
        where: { status: "pending" },
        select: { id: true },
      },
      chapterReports: {
        where: { status: "pending" },
        select: { id: true },
      },
      chapterCommentReports: {
        where: { status: "pending" },
        select: { id: true },
      },
    },
  });

  const processedItems = [];
  const errors = [];
  let processedReportCount = 0;

  for (const reportCase of criticalCases) {
    const reportIds = getCriticalCaseReportIds(reportCase);
    if (!reportIds.length) continue;

    try {
      let latestItem = null;
      for (const reportId of reportIds) {
        latestItem = await updateAdminReportStatus({
          type: reportCase.targetType,
          reportId,
          status: getDefaultActionStatusForType(reportCase.targetType),
          requester,
        });
        processedReportCount += 1;
      }
      if (latestItem) processedItems.push(latestItem);
    } catch (error) {
      errors.push({
        case_id: reportCase.id,
        target_type: reportCase.targetType,
        message:
          error instanceof Error
            ? error.message
            : "Khong the xu ly vu viec critical",
      });
    }
  }

  return {
    processed_case_count: processedItems.length,
    processed_report_count: processedReportCount,
    failed_case_count: errors.length,
    errors,
    items: processedItems,
  };
};

const RESTORABLE_RESOLUTION_ACTIONS = new Set([
  "comment_removed",
  "chapter_hidden",
  "story_hidden",
]);

const validateAppealReason = (reason) => {
  const normalizedReason = normalizeText(reason);
  if (normalizedReason.length < 20) {
    throw new Error("Vui long nhap ly do khang nghi toi thieu 20 ky tu");
  }
  if (normalizedReason.length > 1000) {
    throw new Error("Ly do khang nghi toi da 1000 ky tu");
  }
  return normalizedReason;
};

const getRestorableTargetType = (resolutionAction) => {
  if (resolutionAction === "comment_removed") return "chapter_comment";
  if (resolutionAction === "chapter_hidden") return "chapter";
  if (resolutionAction === "story_hidden") return "story";
  return null;
};

const getReportCaseOwnerContext = async ({ db = prisma, reportCase }) => {
  if (reportCase.targetType === "chapter_comment") {
    const comment = await db.chapterComment.findUnique({
      where: { id: reportCase.targetId },
      select: {
        id: true,
        content: true,
        userId: true,
        isHidden: true,
        chapterId: true,
        chapter: {
          select: {
            id: true,
            chapterNumber: true,
            title: true,
            story: {
              select: {
                id: true,
                title: true,
                slug: true,
              },
            },
          },
        },
      },
    });
    if (!comment) throw new Error("Khong tim thay binh luan");
    return {
      ownerId: comment.userId,
      isHidden: comment.isHidden,
      storyId: comment.chapter?.story?.id ?? null,
      chapterId: comment.chapterId,
      title: "Kháng nghị bình luận đã được tiếp nhận",
      body:
        "AI sẽ xem xét lại ngữ cảnh trước khi quản trị viên đưa ra quyết định cuối cùng.",
      linkUrl:
        comment.chapter?.story?.slug && comment.chapter?.id
          ? `/stories/${comment.chapter.story.slug}/chapters/${comment.chapter.id}`
          : null,
      meta: {
        case_id: reportCase.id,
        audience: "owner",
        report_type: "chapter_comment",
        resolution_action: "appeal_submitted",
        target_type: "chapter_comment",
        comment_id: comment.id,
        comment_preview: String(comment.content || "").slice(0, 120),
        chapter_id: comment.chapterId,
        chapter_number: comment.chapter?.chapterNumber ?? null,
        chapter_title: comment.chapter?.title ?? null,
        story_title: comment.chapter?.story?.title ?? null,
      },
    };
  }

  if (reportCase.targetType === "chapter") {
    const chapter = await db.chapter.findUnique({
      where: { id: reportCase.targetId },
      select: {
        id: true,
        chapterNumber: true,
        title: true,
        isHidden: true,
        story: {
          select: {
            id: true,
            title: true,
            slug: true,
            authorId: true,
          },
        },
      },
    });
    if (!chapter) throw new Error("Khong tim thay chuong");
    return {
      ownerId: chapter.story?.authorId ?? null,
      isHidden: chapter.isHidden,
      storyId: chapter.story?.id ?? null,
      chapterId: chapter.id,
      title: "Kháng nghị chương đã được tiếp nhận",
      body:
        "AI sẽ xem xét lại nội dung chương và lý do kháng nghị trước khi quản trị viên quyết định.",
      linkUrl:
        chapter.story?.slug && chapter.id
          ? `/stories/${chapter.story.slug}/chapters/${chapter.id}`
          : null,
      meta: {
        case_id: reportCase.id,
        audience: "owner",
        report_type: "chapter",
        resolution_action: "appeal_submitted",
        target_type: "chapter",
        chapter_id: chapter.id,
        chapter_number: chapter.chapterNumber,
        chapter_title: chapter.title,
        story_title: chapter.story?.title ?? null,
      },
    };
  }

  const story = await db.story.findUnique({
    where: { id: reportCase.targetId },
    select: {
      id: true,
      title: true,
      slug: true,
      authorId: true,
      isHidden: true,
    },
  });
  if (!story) throw new Error("Khong tim thay truyen");
  return {
    ownerId: story.authorId,
    isHidden: story.isHidden,
    storyId: story.id,
    chapterId: null,
    title: "Kháng nghị truyện đã được tiếp nhận",
    body:
      "AI sẽ xem xét lại nội dung truyện và lý do kháng nghị trước khi quản trị viên quyết định.",
    linkUrl: story.slug ? `/stories/${story.slug}` : null,
    meta: {
      case_id: reportCase.id,
      audience: "owner",
      report_type: "story",
      resolution_action: "appeal_submitted",
      target_type: "story",
      story_id: story.id,
      story_title: story.title,
    },
  };
};

const submitReportCaseAppeal = async ({ caseId, requester, reason }) => {
  const normalizedCaseId = normalizeText(caseId);
  if (!normalizedCaseId) throw new Error("Thieu id vu viec");
  if (!requester?.id) throw new Error("Chua dang nhap");

  const normalizedReason = validateAppealReason(reason);
  const now = new Date();
  let notificationPayload = null;

  const result = await prisma.$transaction(async (tx) => {
    const reportCase = await tx.reportCase.findUnique({
      where: { id: normalizedCaseId },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        status: true,
        resolutionAction: true,
        restoredAt: true,
        appealStatus: true,
      },
    });

    if (!reportCase) throw new Error("Khong tim thay vu viec bao cao");
    if (reportCase.status !== "resolved") {
      throw new Error("Chi co the khang nghi vu viec da xu ly");
    }
    if (reportCase.restoredAt) {
      throw new Error("Noi dung nay da duoc khoi phuc");
    }
    if (!RESTORABLE_RESOLUTION_ACTIONS.has(reportCase.resolutionAction)) {
      throw new Error("Quyet dinh nay khong ho tro khang nghi");
    }
    if (reportCase.appealStatus === "pending") {
      throw new Error("Khang nghi truoc do dang cho xu ly");
    }
    if (reportCase.appealStatus) {
      throw new Error("Vu viec nay da co ket qua khang nghi");
    }

    const ownerContext = await getReportCaseOwnerContext({
      db: tx,
      reportCase,
    });
    if (ownerContext.ownerId !== requester.id) {
      throw new Error("Ban khong co quyen khang nghi vu viec nay");
    }
    if (!ownerContext.isHidden) {
      throw new Error("Noi dung hien khong con bi an");
    }

    const updatedCase = await tx.reportCase.update({
      where: { id: reportCase.id },
      data: {
        appealStatus: "pending",
        appealReason: normalizedReason,
        appealSubmittedAt: now,
        appealResolvedAt: null,
        appealResolvedById: null,
        appealAiSummary: null,
        appealAiRecommendation: null,
        appealAiConfidence: null,
        appealAiCheckedAt: null,
      },
      select: {
        id: true,
        appealStatus: true,
        appealReason: true,
        appealSubmittedAt: true,
      },
    });

    notificationPayload = ownerContext;
    return updatedCase;
  }, { timeout: 15000, maxWait: 10000 });

  if (notificationPayload?.ownerId) {
    await notificationService.createNotification({
      recipientId: notificationPayload.ownerId,
      actorId: null,
      storyId: notificationPayload.storyId,
      chapterId: notificationPayload.chapterId,
      type: "admin_message",
      title: notificationPayload.title,
      body: notificationPayload.body,
      linkUrl: notificationPayload.linkUrl,
      meta: notificationPayload.meta,
    });

    scheduleReportAppealAiAnalysis({
      caseId: normalizedCaseId,
      recipientId: notificationPayload.ownerId,
      storyId: notificationPayload.storyId ?? null,
      chapterId: notificationPayload.chapterId ?? null,
      storySlug: notificationPayload.linkUrl?.match(/\/stories\/([^/]+)/)?.[1] ?? null,
      reportType: notificationPayload.meta?.report_type ?? "story",
    });
  }

  return {
    appealed: true,
    case_id: result.id,
    appeal_status: result.appealStatus,
    appeal_reason: result.appealReason,
    appeal_submitted_at: result.appealSubmittedAt,
    message: "Khang nghi da duoc gui",
  };
};

const restoreAdminReportCase = async ({ caseId, requester }) => {
  const normalizedCaseId = normalizeText(caseId);
  if (!normalizedCaseId) throw new Error("Thieu id vu viec");
  if (!requester?.id) throw new Error("Chua dang nhap");

  let shouldRecomputeFeatured = false;
  let recomputeChapterId = null;

  const transactionResult = await prisma.$transaction(async (tx) => {
    let notificationPayload = null;
    const reportCase = await tx.reportCase.findUnique({
      where: { id: normalizedCaseId },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        status: true,
        resolutionAction: true,
        restoredAt: true,
      },
    });

    if (!reportCase) throw new Error("Khong tim thay vu viec bao cao");
    if (reportCase.status !== "resolved") {
      throw new Error("Chi co the khoi phuc vu viec da xu ly");
    }
    if (reportCase.restoredAt) {
      throw new Error("Vu viec nay da duoc khoi phuc truoc do");
    }
    if (!RESTORABLE_RESOLUTION_ACTIONS.has(reportCase.resolutionAction)) {
      throw new Error("Vu viec nay khong co noi dung can khoi phuc");
    }

    const expectedType = getRestorableTargetType(reportCase.resolutionAction);
    if (expectedType !== reportCase.targetType) {
      throw new Error("Du lieu vu viec khong khop voi hanh dong khoi phuc");
    }

    if (reportCase.targetType === "chapter_comment") {
      const comment = await tx.chapterComment.findUnique({
        where: { id: reportCase.targetId },
        select: {
          id: true,
          content: true,
          isHidden: true,
          chapterId: true,
          userId: true,
          moderationStatus: true,
          chapter: {
            select: {
              id: true,
              chapterNumber: true,
              title: true,
              story: {
                select: {
                  id: true,
                  title: true,
                  slug: true,
                },
              },
            },
          },
        },
      });
      if (!comment) throw new Error("Khong tim thay binh luan can khoi phuc");
      notificationPayload = {
        recipientId: comment.userId,
        storyId: comment.chapter?.story?.id ?? null,
        chapterId: comment.chapterId,
        title: "Bình luận của bạn đã được khôi phục",
        body:
          "Quản trị viên đã xem xét lại và hiển thị bình luận của bạn. Cảm ơn bạn đã kiên nhẫn trong lúc nội dung được rà soát.",
        linkUrl:
          comment.chapter?.story?.slug && comment.chapter?.id
            ? `/stories/${comment.chapter.story.slug}/chapters/${comment.chapter.id}`
            : null,
        meta: {
          case_id: reportCase.id,
          audience: "owner",
          report_type: "chapter_comment",
          resolution_action: "comment_restored",
          target_type: "chapter_comment",
          comment_id: comment.id,
          comment_preview: String(comment.content || "").slice(0, 120),
          chapter_id: comment.chapterId,
          chapter_number: comment.chapter?.chapterNumber ?? null,
          chapter_title: comment.chapter?.title ?? null,
          story_title: comment.chapter?.story?.title ?? null,
          moderated_by: getRequesterDisplayName(requester),
        },
      };

      if (comment.isHidden || comment.moderationStatus !== "approved") {
        await tx.chapterComment.update({
          where: { id: comment.id },
          data: {
            isHidden: false,
            hiddenAt: null,
            hiddenById: null,
            hiddenReason: null,
            moderationStatus: "approved",
          },
        });

        const currentStats = await tx.chapterStat.findUnique({
          where: { chapterId: comment.chapterId },
          select: { commentCount: true },
        });
        await tx.chapterStat.upsert({
          where: { chapterId: comment.chapterId },
          create: {
            chapterId: comment.chapterId,
            likeCount: 0,
            commentCount: 1,
          },
          update: {
            commentCount: (currentStats?.commentCount ?? 0) + 1,
          },
        });
        shouldRecomputeFeatured = true;
        recomputeChapterId = comment.chapterId;
      }
    } else if (reportCase.targetType === "chapter") {
      const chapter = await tx.chapter.findUnique({
        where: { id: reportCase.targetId },
        select: {
          id: true,
          chapterNumber: true,
          title: true,
          story: {
            select: {
              id: true,
              title: true,
              slug: true,
              authorId: true,
            },
          },
        },
      });
      if (!chapter) throw new Error("Khong tim thay chuong can khoi phuc");
      notificationPayload = {
        recipientId: chapter.story?.authorId ?? null,
        storyId: chapter.story?.id ?? null,
        chapterId: chapter.id,
        title: "Chương của bạn đã được khôi phục",
        body:
          "Chương đã được hiển thị trở lại sau khi quản trị viên xem xét lại vụ việc.",
        linkUrl:
          chapter.story?.slug && chapter.id
            ? `/stories/${chapter.story.slug}/chapters/${chapter.id}`
            : null,
        meta: {
          case_id: reportCase.id,
          audience: "owner",
          report_type: "chapter",
          resolution_action: "chapter_restored",
          target_type: "chapter",
          chapter_id: chapter.id,
          chapter_number: chapter.chapterNumber,
          chapter_title: chapter.title,
          story_title: chapter.story?.title ?? null,
          moderated_by: getRequesterDisplayName(requester),
        },
      };

      await tx.chapter.update({
        where: { id: chapter.id },
        data: {
          isHidden: false,
          hiddenAt: null,
          hiddenById: null,
          hiddenReason: null,
        },
      });
    } else if (reportCase.targetType === "story") {
      const story = await tx.story.findUnique({
        where: { id: reportCase.targetId },
        select: {
          id: true,
          title: true,
          slug: true,
          authorId: true,
        },
      });
      if (!story) throw new Error("Khong tim thay truyen can khoi phuc");
      notificationPayload = {
        recipientId: story.authorId,
        storyId: story.id,
        chapterId: null,
        title: "Truyện của bạn đã được khôi phục",
        body:
          "Truyện đã được hiển thị trở lại sau khi quản trị viên xem xét lại vụ việc.",
        linkUrl: story.slug ? `/stories/${story.slug}` : null,
        meta: {
          case_id: reportCase.id,
          audience: "owner",
          report_type: "story",
          resolution_action: "story_restored",
          target_type: "story",
          story_id: story.id,
          story_title: story.title,
          moderated_by: getRequesterDisplayName(requester),
        },
      };

      await tx.story.update({
        where: { id: story.id },
        data: {
          isHidden: false,
          hiddenAt: null,
          hiddenById: null,
          hiddenReason: null,
        },
      });
    }

    await tx.reportCase.update({
      where: { id: reportCase.id },
      data: {
        restoredAt: new Date(),
        restoredById: requester.id,
      },
    });

    const delegate = getAdminReportDelegate(reportCase.targetType, tx);
    const report = await delegate.findFirst({
      where: { caseId: reportCase.id },
      orderBy: { updatedAt: "desc" },
      include: getAdminReportInclude(reportCase.targetType),
    });

    return {
      type: reportCase.targetType,
      report,
      notificationPayload,
    };
  }, { timeout: 15000, maxWait: 10000 });

  if (shouldRecomputeFeatured && recomputeChapterId) {
    await recomputeChapterFeaturedComment({ chapterId: recomputeChapterId });
  }

  if (!transactionResult.report) {
    throw new Error("Khong tim thay bao cao sau khi khoi phuc");
  }

  if (
    transactionResult.notificationPayload?.recipientId &&
    transactionResult.notificationPayload.recipientId !== requester.id
  ) {
    await notificationService.createNotification({
      ...transactionResult.notificationPayload,
      actorId: requester.id,
      type: "admin_message",
    });
  }

  return buildReportSummary({
    type: transactionResult.type,
    report: transactionResult.report,
  });
};

const getReportSummaryForCase = async ({ type, caseId }) => {
  const delegate = getAdminReportDelegate(type);
  const report = await delegate.findFirst({
    where: { caseId },
    orderBy: { updatedAt: "desc" },
    include: getAdminReportInclude(type),
  });
  if (!report) throw new Error("Khong tim thay bao cao trong vu viec");
  return buildReportSummary({ type, report });
};

const resolveReportCaseAppeal = async ({ caseId, action, requester }) => {
  const normalizedCaseId = normalizeText(caseId);
  const normalizedAction = normalizeText(action).toLowerCase();
  if (!normalizedCaseId) throw new Error("Thieu id vu viec");
  if (!requester?.id) throw new Error("Chua dang nhap");
  if (!["accept", "dismiss"].includes(normalizedAction)) {
    throw new Error("Hanh dong khang nghi khong hop le");
  }

  const reportCase = await prisma.reportCase.findUnique({
    where: { id: normalizedCaseId },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      appealStatus: true,
      restoredAt: true,
    },
  });

  if (!reportCase) throw new Error("Khong tim thay vu viec bao cao");
  if (reportCase.appealStatus !== "pending") {
    throw new Error("Vu viec nay khong co khang nghi dang cho xu ly");
  }

  if (normalizedAction === "accept") {
    await restoreAdminReportCase({ caseId: normalizedCaseId, requester });
    await prisma.reportCase.update({
      where: { id: normalizedCaseId },
      data: {
        appealStatus: "accepted",
        appealResolvedAt: new Date(),
        appealResolvedById: requester.id,
      },
    });
    return getReportSummaryForCase({
      type: reportCase.targetType,
      caseId: normalizedCaseId,
    });
  }

  let notificationPayload = null;
  await prisma.$transaction(async (tx) => {
    const currentCase = await tx.reportCase.findUnique({
      where: { id: normalizedCaseId },
      select: {
        id: true,
        targetType: true,
        targetId: true,
      },
    });
    if (!currentCase) throw new Error("Khong tim thay vu viec bao cao");

    const ownerContext = await getReportCaseOwnerContext({
      db: tx,
      reportCase: currentCase,
    });
    notificationPayload = ownerContext;

    await tx.reportCase.update({
      where: { id: normalizedCaseId },
      data: {
        appealStatus: "rejected",
        appealResolvedAt: new Date(),
        appealResolvedById: requester.id,
      },
    });
  }, { timeout: 15000, maxWait: 10000 });

  if (
    notificationPayload?.ownerId &&
    notificationPayload.ownerId !== requester.id
  ) {
    await notificationService.createNotification({
      recipientId: notificationPayload.ownerId,
      actorId: requester.id,
      storyId: notificationPayload.storyId,
      chapterId: notificationPayload.chapterId,
      type: "admin_message",
      title: "Kháng nghị chưa được chấp nhận",
      body:
        "Quản trị viên đã xem xét kháng nghị và giữ nguyên quyết định xử lý trước đó.",
      linkUrl: notificationPayload.linkUrl,
      meta: {
        ...notificationPayload.meta,
        resolution_action: "appeal_rejected",
        moderated_by: getRequesterDisplayName(requester),
      },
    });
  }

  return getReportSummaryForCase({
    type: reportCase.targetType,
    caseId: normalizedCaseId,
  });
};

module.exports = {
  listAdminReports,
  getAdminReportDetail,
  updateAdminReportStatus,
  processCriticalAdminReportCases,
  restoreAdminReportCase,
  submitReportCaseAppeal,
  resolveReportCaseAppeal,
  reportStory,
  reportChapter,
  reportChapterComment,
};
