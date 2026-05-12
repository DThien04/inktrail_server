/**
 * Entrypoint chạy worker process song song với API server.
 *
 * Local:
 *   npm run worker
 *
 * Production: chạy như một process riêng (PM2, Docker service, Render
 * background worker, ...). API server không cần khởi động worker này -
 * gọi đến enqueue helpers vẫn hoạt động.
 */
require("dotenv").config();

const { isQueueEnabled, closeRedisConnection } = require("./config/queue");
const {
  initializeEmitterIo,
  closeSocketRedis,
} = require("./realtime/socket");
const { startAiAnalyzeWorker } = require("./workers/ai-analyze.worker");
const {
  startNotificationWorker,
} = require("./workers/notification.worker");
const {
  startReportAiFollowupWorker,
} = require("./workers/report-ai-followup.worker");

if (!isQueueEnabled()) {
  console.error(
    "[worker] REDIS_URL chưa cấu hình. Worker không khởi động.",
  );
  process.exit(1);
}

// Gắn socket emitter qua Redis adapter để notification từ worker đến được client realtime.
initializeEmitterIo();

const workers = [
  startAiAnalyzeWorker(),
  startNotificationWorker(),
  startReportAiFollowupWorker(),
];

console.log(
  `[worker] Inktrail worker started. Queues: ${workers
    .map((worker) => worker.name)
    .join(", ")}`,
);

let isShuttingDown = false;
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[worker] received ${signal}, đang dừng...`);

  try {
    await Promise.all(workers.map((worker) => worker.close()));
    await closeSocketRedis();
    await closeRedisConnection();
  } catch (error) {
    console.error("[worker] shutdown error", error?.message || error);
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
