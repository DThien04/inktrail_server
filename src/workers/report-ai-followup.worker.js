/**
 * Worker xử lý queue `report-ai-followup`.
 * Mỗi job: analyze (case/appeal) + gửi notification cho reporter/owner.
 */
const { createWorker } = require("../config/queue");
const {
  REPORT_AI_FOLLOWUP_QUEUE_NAME,
} = require("../queues/report-ai-followup.queue");
const notificationService = require("../modules/notification/notification.service");
const {
  analyzeReportCaseAi,
  analyzeReportCaseAppealAi,
} = require("../modules/report/report-ai.service");

const buildReportTargetLink = ({ type, storySlug, chapterId }) => {
  if (!storySlug) return null;
  if (type === "story") return `/stories/${storySlug}`;
  if (chapterId) return `/stories/${storySlug}/chapters/${chapterId}`;
  return `/stories/${storySlug}`;
};

const summarizeReportAiForUser = (reportCase) => {
  const summary = (reportCase?.aiSummary || "").trim();
  if (summary) return summary;
  return "Bên mình đã nhận báo cáo của bạn. Đội ngũ đang xem xét và sẽ gửi kết quả sớm.";
};

const summarizeAppealAiForUser = (reportCase) => {
  const summary = (reportCase?.appealAiSummary || "").trim();
  if (summary) return summary;
  return "Khiếu nại của bạn đã được tiếp nhận và chuyển đến quản trị viên để xem xét.";
};

const processCaseFollowup = async ({
  type,
  caseId,
  recipientId,
  storyId,
  chapterId,
  storySlug,
}) => {
  const analyzed = await analyzeReportCaseAi({ type, caseId });
  if (!analyzed || !recipientId) return null;

  await notificationService.createNotification({
    recipientId,
    actorId: null,
    storyId: storyId ?? null,
    chapterId: chapterId ?? null,
    type: "admin_message",
    title: "Báo cáo của bạn đang được xem xét",
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

  return analyzed.id;
};

const processAppealFollowup = async ({
  caseId,
  recipientId,
  storyId,
  chapterId,
  storySlug,
  reportType,
}) => {
  const analyzed = await analyzeReportCaseAppealAi({ caseId });
  if (!analyzed || !recipientId) return null;

  await notificationService.createNotification({
    recipientId,
    actorId: null,
    storyId: storyId ?? null,
    chapterId: chapterId ?? null,
    type: "admin_message",
    title: "Khiếu nại của bạn đang được xem xét",
    body: summarizeAppealAiForUser(analyzed),
    linkUrl: buildReportTargetLink({ type: reportType, storySlug, chapterId }),
    meta: {
      case_id: analyzed.id,
      audience: "owner",
      report_type: reportType,
      resolution_action: "appeal_ai_analyzed",
      appeal_ai_checked_at: analyzed.appealAiCheckedAt ?? null,
      appeal_ai_recommendation: analyzed.appealAiRecommendation ?? null,
    },
  });

  return analyzed.id;
};

const startReportAiFollowupWorker = () => {
  const worker = createWorker(
    REPORT_AI_FOLLOWUP_QUEUE_NAME,
    async (job) => {
      const data = job.data || {};
      if (data.kind === "case") return processCaseFollowup(data);
      if (data.kind === "appeal") return processAppealFollowup(data);
      return null;
    },
    { concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    console.error("[worker:report-ai-followup:failed]", {
      jobId: job?.id,
      kind: job?.data?.kind,
      caseId: job?.data?.caseId,
      attemptsMade: job?.attemptsMade,
      message: err?.message,
    });
  });

  return worker;
};

module.exports = { startReportAiFollowupWorker };
