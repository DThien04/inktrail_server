const express = require("express");
const router = express.Router();

const reportController = require("./report.controller");
const { authenticate } = require("../../middlewares/auth.middleware");

router.post(
  "/stories/:storyId",
  authenticate,
  reportController.reportStory,
);

router.post(
  "/chapters/:chapterId",
  authenticate,
  reportController.reportChapter,
);

router.post(
  "/chapter-comments/:commentId",
  authenticate,
  reportController.reportChapterComment,
);

module.exports = router;
