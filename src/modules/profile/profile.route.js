const express = require("express");
const router = express.Router();
const profileController = require("./profile.controller");
const {
  authenticate,
  authenticateOptional,
} = require("../../middlewares/auth.middleware");
const { upload } = require("../../middlewares/upload.middleware");

router.get("/me", authenticate, profileController.getMe);
router.get("/me/following-authors", authenticate, profileController.listFollowedAuthors);
router.patch("/me", authenticate, upload.single("avatar_file"), profileController.updateMe);
router.patch("/me/password", authenticate, profileController.changeMyPassword);
router.post("/me/avatar", authenticate, upload.single("avatar_file"), profileController.uploadMyAvatar);
router.delete("/me/avatar", authenticate, profileController.deleteMyAvatar);
router.get("/me/reading-progress", authenticate, profileController.listMyReadingProgress);
router.get(
  "/me/reading-progress/:storyId",
  authenticate,
  profileController.getMyReadingProgressByStory,
);
router.put(
  "/me/reading-progress/:storyId",
  authenticate,
  profileController.upsertMyReadingProgress,
);
router.get("/:id", authenticateOptional, profileController.getById);
router.post("/:id/follow", authenticate, profileController.followAuthor);
router.delete("/:id/follow", authenticate, profileController.unfollowAuthor);

module.exports = router;
