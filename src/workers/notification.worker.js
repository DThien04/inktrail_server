/**
 * Worker xử lý queue `notification`.
 * Gọi thẳng `notificationService.createNotification` để giữ nguyên logic
 * persist + emit socket + push.
 */
const { createWorker } = require("../config/queue");
const { NOTIFICATION_QUEUE_NAME } = require("../queues/notification.queue");
const notificationService = require("../modules/notification/notification.service");

const startNotificationWorker = () => {
  const worker = createWorker(
    NOTIFICATION_QUEUE_NAME,
    async (job) => {
      const payload = job.data || {};
      const notification = await notificationService.createNotification(payload);
      return notification?.id ?? null;
    },
    { concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    console.error("[worker:notification:failed]", {
      jobId: job?.id,
      recipient_id: job?.data?.recipientId,
      type: job?.data?.type,
      attemptsMade: job?.attemptsMade,
      message: err?.message,
    });
  });

  return worker;
};

module.exports = { startNotificationWorker };
