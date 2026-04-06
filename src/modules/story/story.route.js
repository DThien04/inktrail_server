const express = require("express");
const router = express.Router();

const storyController = require("./story.controller");
const { authenticate, authenticateOptional } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { upload } = require("../../middlewares/upload.middleware");

router.get(
  "/me/list",
  authenticate,
  authorize("author", "admin"),
  storyController.getMyStories,
);
router.get(
  "/admin/list",
  authenticate,
  authorize("admin"),
  storyController.getAdminStories,
);
router.get("/search", storyController.searchStories);
router.post("/:id/read-event", authenticateOptional, storyController.trackReadEvent);
router.post("/:id/like", authenticate, storyController.likeStory);
router.delete("/:id/like", authenticate, storyController.unlikeStory);
router.get("/:id/comments", authenticateOptional, storyController.getComments);
router.post("/:id/comments", authenticate, storyController.createComment);
router.post(
  "/",
  authenticate,
  authorize("author", "admin"),
  upload.single("cover_file"),
  storyController.createStory,
);
router.patch(
  "/:id",
  authenticate,
  authorize("author", "admin"),
  upload.single("cover_file"),
  storyController.updateStory,
);
router.delete(
  "/:id",
  authenticate,
  authorize("author", "admin"),
  storyController.deleteStory,
);
router.get("/:slug", authenticateOptional, storyController.getBySlug);

module.exports = router;
