const express = require("express");
const router = express.Router();

const storyController = require("./story.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { upload } = require("../../middlewares/upload.middleware");

router.get(
  "/me/list",
  authenticate,
  authorize("author", "admin"),
  storyController.getMyStories,
);
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
router.get("/:slug", storyController.getBySlug);

module.exports = router;
