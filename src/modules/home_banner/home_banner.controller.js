const { handleError } = require("../../utils/error_handle");
const homeBannerService = require("./home_banner.service");

const getPublicHomeBanners = async (_req, res) => {
  try {
    const banners = await homeBannerService.getPublicHomeBanners();
    res.json(banners);
  } catch (err) {
    handleError(err, res);
  }
};

const getHomeBanners = async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive !== "false";
    const banners = await homeBannerService.getHomeBanners({
      includeInactive,
    });
    res.json(banners);
  } catch (err) {
    handleError(err, res);
  }
};

const createHomeBanner = async (req, res) => {
  try {
    const { story_id, sort_order, is_active } = req.body;
    const banner = await homeBannerService.createHomeBanner({
      storyId: story_id,
      sortOrder: sort_order,
      isActive: is_active,
    });

    res.status(201).json({
      message: "Tạo banner trang chủ thành công",
      banner,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const updateHomeBanner = async (req, res) => {
  try {
    const { sort_order, is_active } = req.body;
    const banner = await homeBannerService.updateHomeBanner({
      bannerId: req.params.id,
      sortOrder: sort_order,
      isActive: is_active,
    });

    res.json({
      message: "Cập nhật banner trang chủ thành công",
      banner,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const deleteHomeBanner = async (req, res) => {
  try {
    const result = await homeBannerService.deleteHomeBanner({
      bannerId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  getPublicHomeBanners,
  getHomeBanners,
  createHomeBanner,
  updateHomeBanner,
  deleteHomeBanner,
};
