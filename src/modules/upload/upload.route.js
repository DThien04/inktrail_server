const express = require("express");
const router = express.Router();
const uploadController = require("./upload.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { upload } = require("../../middlewares/upload.middleware");

router.post("/avatar", authenticate, upload.single("avatar_file"), uploadController.uploadAvatar);

module.exports = router;
