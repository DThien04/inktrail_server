const express = require("express");

const announcementController = require("./announcement.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const router = express.Router();

router.get("/", announcementController.listPublicAnnouncements);

router.get(
  "/admin",
  authenticate,
  authorize("admin"),
  announcementController.listAdminAnnouncements,
);
router.post(
  "/admin",
  authenticate,
  authorize("admin"),
  announcementController.createAnnouncement,
);
router.patch(
  "/admin/:id",
  authenticate,
  authorize("admin"),
  announcementController.updateAnnouncement,
);
router.delete(
  "/admin/:id",
  authenticate,
  authorize("admin"),
  announcementController.deleteAnnouncement,
);

module.exports = router;
