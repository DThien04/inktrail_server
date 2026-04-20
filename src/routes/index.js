const express = require("express");
const router = express.Router();

router.use("/auth", require("../modules/auth/auth.route"));
router.use("/upload", require("../modules/upload/upload.route"));
router.use("/profile", require("../modules/profile/profile.route"));
router.use("/notifications", require("../modules/notification/notification.route"));
router.use("/announcements", require("../modules/announcement/announcement.route"));
router.use("/reports", require("../modules/report/report.route"));
router.use("/stories", require("../modules/story/story.route"));
router.use("/chapters", require("../modules/chapter/chapter.route"));
router.use("/genres", require("../modules/genre/genre.route"));
router.use("/", require("../modules/home/home.route"));
// Sau thêm feature mới vào đây:
// router.use('/stories',   require('../modules/story/story.routes'));
// router.use('/chapters',  require('../modules/chapter/chapter.routes'));
// router.use('/profile',   require('../modules/profile/profile.routes'));
// router.use('/ratings',   require('../modules/rating/rating.routes'));
// router.use('/bookmarks', require('../modules/bookmark/bookmark.routes'));

router.use("/", require("../modules/home_banner/home_banner.route"));

module.exports = router;
