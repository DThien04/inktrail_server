const { handleError } = require("../../utils/error_handle");
const announcementService = require("./announcement.service");

const listPublicAnnouncements = async (req, res) => {
  try {
    const rows = await announcementService.listPublicAnnouncements({
      limit: req.query.limit,
    });
    res.json(rows);
  } catch (err) {
    handleError(err, res);
  }
};

const listAdminAnnouncements = async (_req, res) => {
  try {
    const rows = await announcementService.listAdminAnnouncements();
    res.json(rows);
  } catch (err) {
    handleError(err, res);
  }
};

const createAnnouncement = async (req, res) => {
  try {
    const announcement = await announcementService.createAnnouncement({
      title: req.body.title,
      body: req.body.body,
      linkUrl: req.body.link_url,
      type: req.body.type,
      isActive: req.body.is_active,
      publishedAt: req.body.published_at,
    });
    res.status(201).json({
      message: "Announcement created successfully",
      announcement,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const updateAnnouncement = async (req, res) => {
  try {
    const announcement = await announcementService.updateAnnouncement({
      announcementId: req.params.id,
      title: req.body.title,
      body: req.body.body,
      linkUrl: req.body.link_url,
      type: req.body.type,
      isActive: req.body.is_active,
      publishedAt: req.body.published_at,
    });
    res.json({
      message: "Announcement updated successfully",
      announcement,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const deleteAnnouncement = async (req, res) => {
  try {
    const result = await announcementService.deleteAnnouncement({
      announcementId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  listPublicAnnouncements,
  listAdminAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
