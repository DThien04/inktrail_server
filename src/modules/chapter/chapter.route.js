const express = require("express");
const router = express.Router();

const chapterController = require("./chapter.controller");
const { authenticate } = require("../../middlewares/auth.middleware");

const authenticateOptional = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return next();
  return authenticate(req, _res, next);
};

router.get("/stories/:storyId/chapters", authenticateOptional, chapterController.getByStory);
router.get("/:id/comments", authenticateOptional, chapterController.getComments);
router.get(
  "/:id/comments/featured",
  authenticateOptional,
  chapterController.getFeaturedComment,
);
router.post(
  "/:id/comments/featured/recompute",
  authenticate,
  chapterController.recomputeFeaturedComment,
);
router.post("/:id/comments", authenticate, chapterController.createComment);
router.post(
  "/comments/:commentId/like",
  authenticate,
  chapterController.likeComment,
);
router.delete(
  "/comments/:commentId/like",
  authenticate,
  chapterController.unlikeComment,
);
router.patch(
  "/comments/:commentId",
  authenticate,
  chapterController.updateComment,
);
router.delete(
  "/comments/:commentId",
  authenticate,
  chapterController.deleteComment,
);
router.get("/:id", authenticateOptional, chapterController.getById);
router.post("/:id/like", authenticate, chapterController.likeChapter);
router.delete("/:id/like", authenticate, chapterController.unlikeChapter);

router.post(
  "/stories/:storyId/chapters",
  authenticate,
  chapterController.createChapter,
);
router.patch(
  "/:id",
  authenticate,
  chapterController.updateChapter,
);
router.post(
  "/:id/publish",
  authenticate,
  chapterController.publishChapter,
);
router.post(
  "/:id/unpublish",
  authenticate,
  chapterController.unpublishChapter,
);
router.post(
  "/:id/move",
  authenticate,
  chapterController.moveChapter,
);
router.delete(
  "/:id",
  authenticate,
  chapterController.deleteChapter,
);

module.exports = router;
