const { handleError } = require("../../utils/error_handle");
const notificationService = require("./notification.service");

const listMyNotifications = async (req, res) => {
  try {
    const result = await notificationService.listNotifications({
      userId: req.user.id,
      limit: req.query.limit,
      cursor: req.query.cursor,
      unreadOnly: req.query.unread_only,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const getMyUnreadCount = async (req, res) => {
  try {
    const result = await notificationService.getUnreadCount({
      userId: req.user.id,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const markMyNotificationAsRead = async (req, res) => {
  try {
    const notification = await notificationService.markAsRead({
      userId: req.user.id,
      notificationId: req.params.id,
    });

    res.json({
      message: "Đã đánh dấu thông báo là đã đọc",
      notification,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const markAllMyNotificationsAsRead = async (req, res) => {
  try {
    const result = await notificationService.markAllAsRead({
      userId: req.user.id,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

const createTestNotification = async (req, res) => {
  try {
    const notification = await notificationService.createTestNotification({
      currentUser: req.user,
      recipientId: req.body.recipient_id,
      type: req.body.type,
      title: req.body.title,
      body: req.body.body,
      storyId: req.body.story_id,
      chapterId: req.body.chapter_id,
      linkUrl: req.body.link_url,
      meta: req.body.meta,
    });

    res.status(201).json({
      message: "Đã tạo thông báo thử nghiệm",
      notification,
    });
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  listMyNotifications,
  getMyUnreadCount,
  markMyNotificationAsRead,
  markAllMyNotificationsAsRead,
  createTestNotification,
};
