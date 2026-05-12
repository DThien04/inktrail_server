/**
 * Worker xử lý queue `report-ai-analyze`.
 *
 * Nhận job `{ type, caseId }` → gọi `analyzeReportCaseAi` (service hiện hữu).
 * BullMQ tự retry theo `defaultJobOptions` (attempts: 3, backoff exponential).
 */
const { createWorker } = require("../config/queue");
const { AI_ANALYZE_QUEUE_NAME } = require("../queues/ai-analyze.queue");
const {
  analyzeReportCaseAi,
} = require("../modules/report/report-ai.service");

const startAiAnalyzeWorker = () => {
  const worker = createWorker(
    AI_ANALYZE_QUEUE_NAME,
    async (job) => {
      const { type, caseId } = job.data || {};
      if (!type || !caseId) return null;
      const analyzed = await analyzeReportCaseAi({ type, caseId });
      return analyzed?.id ?? null;
    },
    { concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    console.error("[worker:report-ai-analyze:failed]", {
      jobId: job?.id,
      data: job?.data,
      attemptsMade: job?.attemptsMade,
      message: err?.message,
    });
  });

  worker.on("completed", (job) => {
    if (process.env.WORKER_LOG_COMPLETED === "true") {
      console.log("[worker:report-ai-analyze:completed]", {
        jobId: job?.id,
        data: job?.data,
      });
    }
  });

  return worker;
};

module.exports = { startAiAnalyzeWorker };
