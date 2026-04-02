const express = require("express");
const router = express.Router();

const homeBannerController = require("./home_banner.controller");
const { authenticate } = require("../../middlewares/auth.middleware");
const { authorize } = require("../../middlewares/role.middleware");
const { upload } = require("../../middlewares/upload.middleware");

router.get("/home/banners", homeBannerController.getPublicHomeBanners);

router.get(
  "/admin/home-banners",
  authenticate,
  authorize("admin"),
  homeBannerController.getHomeBanners,
);
router.post(
  "/admin/home-banners",
  authenticate,
  authorize("admin"),
  upload.single("banner_file"),
  homeBannerController.createHomeBanner,
);
router.patch(
  "/admin/home-banners/:id",
  authenticate,
  authorize("admin"),
  upload.single("banner_file"),
  homeBannerController.updateHomeBanner,
);
router.delete(
  "/admin/home-banners/:id",
  authenticate,
  authorize("admin"),
  homeBannerController.deleteHomeBanner,
);

module.exports = router;
