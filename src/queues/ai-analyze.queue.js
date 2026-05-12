/**
 * Queue xử lý AI analyze cho ReportCase ở chế độ background.
 *
 * Caller gọi `dispatchAiAnalyze({ type, caseId })`:
 * - Nếu Redis sẵn sàng → enqueue job, request trả về ngay.
 * - Nếu không có Redis (dev/local chưa setup) → fallback chạy sync để không
 *   bỏ sót logic phân tích.
 *
 * Worker process xử lý job sống ở `src/workers/ai-analyze.worker.js`.
 */
const { createQueue, isQueueEnabled } = require("../config/queue");

const AI_ANALYZE_QUEUE_NAME = "report-ai-analyze";

const queue = createQueue(AI_ANALYZE_QUEUE_NAME);

const buildJobId = ({ type, caseId }) => `${type}:${caseId}`;

const enqueueAiAnalyze = async ({ type, caseId }) => {
  if (!type || !caseId) return null;
  if (!queue) return null;

  return queue.add(
    "analyze",
    { type, caseId },
    {
      jobId: buildJobId({ type, caseId }),
    },
  );
};

const dispatchAiAnalyze = async ({ type, caseId }) => {
  if (!type || !caseId) return null;

  try {
    const job = await enqueueAiAnalyze({ type, caseId });
    if (job) return { mode: "queued", jobId: job.id };
  } catch (error) {
    console.error("[ai-analyze-queue:enqueue-error]", {
      type,
      caseId,
      message: error?.message || String(error),
    });
  }

  const { analyzeReportCaseAi } = require("../modules/report/report-ai.service");
  const result = await analyzeReportCaseAi({ type, caseId });
  return { mode: "sync", result };
};

module.exports = {
  AI_ANALYZE_QUEUE_NAME,
  aiAnalyzeQueue: queue,
  enqueueAiAnalyze,
  dispatchAiAnalyze,
  isAiAnalyzeQueueEnabled: isQueueEnabled,
};
