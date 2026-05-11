const express = require("express");
const router = express.Router();

const notificationController = require("./notification.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

router.get("/public/admin-broadcasts", notificationController.listPublicAdminBroadcastLogs);
router.get("/me", authenticate, notificationController.listMyNotifications);
router.get("/me/unread-count", authenticate, notificationController.getMyUnreadCount);
router.patch("/me/read-all", authenticate, notificationController.markAllMyNotificationsAsRead);
router.get(
  "/admin/broadcasts",
  authenticate,
  authorize("admin"),
  notificationController.listAdminBroadcastLogs,
);
router.patch("/:id/read", authenticate, notificationController.markMyNotificationAsRead);
router.post("/test", authenticate, authorize("admin"), notificationController.createTestNotification);
router.post(
  "/admin/push",
  authenticate,
  authorize("admin"),
  notificationController.adminSendPushNotifications,
);

module.exports = router;
