const { handleError } = require("../../utils/error_handle");
const authorApplicationService = require("./author_application.service");

const getMyEligibility = async (req, res) => {
  try {
    const data = await authorApplicationService.getMyEligibility({
      userId: req.user.id,
    });
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
};

const submitMyApplication = async (req, res) => {
  try {
    const { pen_name, bio, reason, sample_links } = req.body;
    const data = await authorApplicationService.submitApplication({
      userId: req.user.id,
      penName: pen_name,
      bio,
      reason,
      sampleLinks: sample_links,
    });
    res.status(201).json({
      message: "Đã gửi đơn đăng ký tác giả",
      application: data,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const getMyApplications = async (req, res) => {
  try {
    const rows = await authorApplicationService.getMyApplications({
      userId: req.user.id,
      limit: req.query.limit,
    });
    res.json(rows);
  } catch (err) {
    handleError(err, res);
  }
};

const listAdminApplications = async (req, res) => {
  try {
    const rows = await authorApplicationService.listAdminApplications({
      status: req.query.status,
      limit: req.query.limit,
    });
    res.json(rows);
  } catch (err) {
    handleError(err, res);
  }
};

const getAdminApplicationById = async (req, res) => {
  try {
    const data = await authorApplicationService.getApplicationByIdForAdmin({
      applicationId: req.params.id,
    });
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
};

const approveAdminApplication = async (req, res) => {
  try {
    const data = await authorApplicationService.approveApplication({
      applicationId: req.params.id,
      adminId: req.user.id,
      reviewNote: req.body.review_note,
    });
    res.json({
      message: "Đã duyệt đơn đăng ký tác giả",
      application: data,
    });
  } catch (err) {
    handleError(err, res);
  }
};

const rejectAdminApplication = async (req, res) => {
  try {
    const data = await authorApplicationService.rejectApplication({
      applicationId: req.params.id,
      adminId: req.user.id,
      reviewNote: req.body.review_note,
    });
    res.json({
      message: "Đã từ chối đơn đăng ký tác giả",
      application: data,
    });
  } catch (err) {
    handleError(err, res);
  }
};

module.exports = {
  getMyEligibility,
  submitMyApplication,
  getMyApplications,
  listAdminApplications,
  getAdminApplicationById,
  approveAdminApplication,
  rejectAdminApplication,
};
