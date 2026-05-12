/**
 * Queue đẩy notification ra background để khỏi block API request.
 *
 * Caller dùng `dispatchNotification(payload)`:
 * - Nếu Redis sẵn sàng → enqueue job, return ngay (không cần await xa).
 * - Nếu không có Redis → fallback chạy đồng bộ qua notification.service.
 *
 * Lưu ý: vì notification trở thành async, caller KHÔNG nhận lại notification
 * object. Mọi code đang dùng giá trị trả về phải tiếp tục gọi sync (gọi
 * thẳng `notificationService.createNotification`) - hiện chưa có ai làm vậy
 * trong các route đã chuyển sang dispatch.
 */
const { createQueue } = require("../config/queue");

const NOTIFICATION_QUEUE_NAME = "notification";
const queue = createQueue(NOTIFICATION_QUEUE_NAME);

const dispatchNotification = async (payload) => {
  if (!payload || !payload.recipientId) return null;

  if (queue) {
    try {
      return await queue.add("create", payload, {
        // Notification không cần idempotent jobId; mỗi lần dispatch là một
        // bản ghi mới (đa số là follow-up khác nhau).
      });
    } catch (error) {
      console.error("[notification-queue:enqueue-error]", {
        recipient_id: payload.recipientId,
        type: payload.type,
        message: error?.message || String(error),
      });
    }
  }

  const notificationService = require("../modules/notification/notification.service");
  return notificationService.createNotification(payload);
};

module.exports = {
  NOTIFICATION_QUEUE_NAME,
  notificationQueue: queue,
  dispatchNotification,
};
