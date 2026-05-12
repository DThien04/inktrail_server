/**
 * Queue cho luồng phân tích AI background ngay sau khi user gửi báo cáo /
 * khiếu nại. Gồm 2 loại job:
 * - `case`: analyze ReportCase rồi gửi notification cho reporter.
 * - `appeal`: analyze appeal của ReportCase rồi gửi notification cho owner.
 *
 * Thay thế pattern `setTimeout` cũ trong report.service. BullMQ tự retry
 * theo `defaultJobOptions` (attempts 3, backoff exponential).
 */
const { createQueue, isQueueEnabled } = require("../config/queue");

const REPORT_AI_FOLLOWUP_QUEUE_NAME = "report-ai-followup";
const queue = createQueue(REPORT_AI_FOLLOWUP_QUEUE_NAME);

const enqueueReportCaseAiFollowup = async (payload) => {
  if (!queue || !payload?.caseId) return null;
  return queue.add(
    `case:${payload.type || "unknown"}`,
    { kind: "case", ...payload },
    {
      jobId: `case:${payload.type}:${payload.caseId}:${payload.recipientId || "anon"}`,
    },
  );
};

const enqueueReportAppealAiFollowup = async (payload) => {
  if (!queue || !payload?.caseId) return null;
  return queue.add(
    `appeal:${payload.reportType || "unknown"}`,
    { kind: "appeal", ...payload },
    {
      jobId: `appeal:${payload.reportType}:${payload.caseId}:${payload.recipientId || "anon"}`,
    },
  );
};

module.exports = {
  REPORT_AI_FOLLOWUP_QUEUE_NAME,
  reportAiFollowupQueue: queue,
  enqueueReportCaseAiFollowup,
  enqueueReportAppealAiFollowup,
  isReportAiFollowupQueueEnabled: isQueueEnabled,
};
