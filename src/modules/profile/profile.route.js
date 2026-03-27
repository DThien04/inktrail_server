const express = require("express");
const router = express.Router();
const profileController = require("./profile.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { upload } = require("../../middlewares/upload.middleware");

router.get("/me", authenticate, profileController.getMe);
router.patch("/me", authenticate, upload.single("avatar_file"), profileController.updateMe);
router.post("/me/avatar", authenticate, upload.single("avatar_file"), profileController.uploadMyAvatar);
router.delete("/me/avatar", authenticate, profileController.deleteMyAvatar);
router.get("/:id", profileController.getById);

module.exports = router;
