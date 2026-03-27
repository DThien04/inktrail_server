const express = require("express");
const router = express.Router();

const chapterController = require("./chapter.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");

const authenticateOptional = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return next();
  return authenticate(req, _res, next);
};

router.get("/stories/:storyId/chapters", authenticateOptional, chapterController.getByStory);
router.get("/:id", authenticateOptional, chapterController.getById);

router.post(
  "/stories/:storyId/chapters",
  authenticate,
  authorize("author", "admin"),
  chapterController.createChapter,
);
router.patch(
  "/:id",
  authenticate,
  authorize("author", "admin"),
  chapterController.updateChapter,
);
router.delete(
  "/:id",
  authenticate,
  authorize("author", "admin"),
  chapterController.deleteChapter,
);

module.exports = router;
